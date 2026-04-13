'use strict';

/**
 * queue.js
 *
 * In-memory FIFO job queue manager for KRA NIL return automation.
 *
 * Responsibilities:
 *  - Accept new jobs from the Telegram bot.
 *  - Maintain job state (pending → processing → completed | failed).
 *  - Emit events so the worker and bot can react to state changes.
 *  - Support automatic retry for failed jobs (up to MAX_RETRIES times).
 *  - Provide queue position information for user feedback.
 *
 * Scalability note:
 *  This implementation uses an in-process array queue, which is suitable for
 *  a single-server deployment. To scale horizontally (multiple servers), swap
 *  this module for a Redis-backed queue using BullMQ. The interface exported
 *  here is designed to be compatible with such a migration — callers use
 *  `enqueue`, `getPosition`, and listen to `jobQueue` events.
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');

// ─── Configuration ────────────────────────────────────────────────────────────

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 5_000; // 5 seconds between retry attempts

// ─── Job States ───────────────────────────────────────────────────────────────

const JobState = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
});

// ─── Queue Manager ────────────────────────────────────────────────────────────

class JobQueue extends EventEmitter {
  constructor() {
    super();

    /**
     * The FIFO queue — an ordered array of job objects.
     * @type {Array<Job>}
     */
    this._queue = [];

    /**
     * A map of all jobs by ID for O(1) lookup.
     * @type {Map<string, Job>}
     */
    this._jobs = new Map();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Adds a new NIL return job to the end of the queue.
   *
   * @param {object} jobData
   * @param {string|number} jobData.userId   - Telegram chat ID
   * @param {string} jobData.kraPin          - KRA PIN
   * @param {string} jobData.password        - iTax password
   *
   * @returns {Job} The created job object
   */
  enqueue({ userId, kraPin, password }) {
    const job = {
      id: uuidv4(),
      userId,
      kraPin,
      password,
      state: JobState.PENDING,
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      result: null,
      error: null,
    };

    this._queue.push(job);
    this._jobs.set(job.id, job);

    const position = this.getPosition(job.id);
    logger.info(`Job enqueued: ${job.id} | User: ${userId} | Position: ${position}`);

    this.emit('enqueued', job, position);
    return job;
  }

  /**
   * Retrieves and removes the next pending job from the front of the queue.
   * Returns null if the queue is empty or all remaining jobs are non-pending.
   *
   * @returns {Job|null}
   */
  dequeue() {
    const index = this._queue.findIndex((j) => j.state === JobState.PENDING);
    if (index === -1) return null;

    const job = this._queue[index];
    this._updateJobState(job, JobState.PROCESSING);
    logger.info(`Job dequeued for processing: ${job.id} | User: ${job.userId}`);
    return job;
  }

  /**
   * Marks a job as successfully completed and stores the result.
   *
   * @param {string} jobId
   * @param {object} result  - The result payload from kraService
   */
  markCompleted(jobId, result) {
    const job = this._getJob(jobId);
    if (!job) return;

    job.result = result;
    this._updateJobState(job, JobState.COMPLETED);
    this._removeFromQueue(jobId);

    logger.info(`Job completed: ${jobId} | User: ${job.userId}`);
    this.emit('completed', job);
  }

  /**
   * Marks a job as failed. If the job has remaining retry attempts,
   * it is re-queued at the back of the queue after RETRY_DELAY_MS.
   *
   * @param {string} jobId
   * @param {string} errorMessage
   */
  markFailed(jobId, errorMessage) {
    const job = this._getJob(jobId);
    if (!job) return;

    job.error = errorMessage;
    job.attempts += 1;

    if (job.attempts <= MAX_RETRIES) {
      logger.warn(
        `Job ${jobId} failed (attempt ${job.attempts}/${MAX_RETRIES + 1}). ` +
        `Retrying in ${RETRY_DELAY_MS / 1000}s...`
      );

      this._updateJobState(job, JobState.PENDING);
      this.emit('retrying', job, job.attempts);

      // Re-queue at the back after a delay
      setTimeout(() => {
        // Move to end of queue for fair scheduling
        this._removeFromQueue(jobId);
        this._queue.push(job);
        logger.info(`Job ${jobId} re-queued for retry (attempt ${job.attempts + 1})`);
        this.emit('ready'); // Signal the worker that a job is available
      }, RETRY_DELAY_MS);

    } else {
      this._updateJobState(job, JobState.FAILED);
      this._removeFromQueue(jobId);

      logger.error(
        `Job ${jobId} permanently failed after ${job.attempts} attempts: ${errorMessage}`
      );
      this.emit('failed', job);
    }
  }

  /**
   * Returns the 1-based queue position of a pending job.
   * Returns 0 if the job is not found or not pending.
   *
   * @param {string} jobId
   * @returns {number}
   */
  getPosition(jobId) {
    const pendingJobs = this._queue.filter((j) => j.state === JobState.PENDING);
    const index = pendingJobs.findIndex((j) => j.id === jobId);
    return index === -1 ? 0 : index + 1;
  }

  /**
   * Returns the total number of pending jobs in the queue.
   * @returns {number}
   */
  get pendingCount() {
    return this._queue.filter((j) => j.state === JobState.PENDING).length;
  }

  /**
   * Returns the total number of jobs currently being processed.
   * @returns {number}
   */
  get processingCount() {
    return this._queue.filter((j) => j.state === JobState.PROCESSING).length;
  }

  /**
   * Returns a snapshot of the current queue for diagnostics.
   * Passwords are redacted for security.
   *
   * @returns {Array<object>}
   */
  getSnapshot() {
    return this._queue.map(({ password: _pw, ...safe }) => safe);
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  _getJob(jobId) {
    const job = this._jobs.get(jobId);
    if (!job) {
      logger.warn(`Job not found: ${jobId}`);
      return null;
    }
    return job;
  }

  _updateJobState(job, newState) {
    job.state = newState;
    job.updatedAt = new Date();
  }

  _removeFromQueue(jobId) {
    const index = this._queue.findIndex((j) => j.id === jobId);
    if (index !== -1) {
      this._queue.splice(index, 1);
    }
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

/**
 * A single shared queue instance used across the entire application.
 * Both bot.js and worker.js import this same instance.
 */
const jobQueue = new JobQueue();

module.exports = { jobQueue, JobState };
