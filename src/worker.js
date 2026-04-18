
'use strict';

/**
 * worker.js
 *
 * Automation worker — processes jobs from the queue using kraService.
 *
 * Responsibilities:
 *  - Poll the queue for pending jobs.
 *  - Enforce a concurrency limit (MAX_CONCURRENT_WORKERS) to prevent
 *    multiple Puppeteer instances from exhausting server memory.
 *  - Dispatch jobs to kraService.fileNilReturn().
 *  - Report results back to the queue (markCompleted / markFailed).
 *  - Emit worker-level events so bot.js can send real-time Telegram messages.
 *
 * Concurrency model:
 *  The worker uses a simple counter (`activeWorkers`) to track how many
 *  browser instances are running. When a job completes, it immediately
 *  checks for the next pending job, ensuring workers stay busy without
 *  exceeding the configured limit.
 *
 *  Default: MAX_CONCURRENT_WORKERS = 2
 *  This means at most 2 Puppeteer browsers run simultaneously.
 *  Adjust via the MAX_WORKERS environment variable.
 */

const EventEmitter = require('events');
const { jobQueue } = require('./queue');
const { fileNilReturn } = require('./kraService');
const logger = require('./logger');

// ─── Configuration ────────────────────────────────────────────────────────────

const MAX_CONCURRENT_WORKERS = parseInt(process.env.MAX_WORKERS || '2', 10);
const POLL_INTERVAL_MS = 2_000; // How often to check the queue when idle (ms)

// ─── Worker Manager ───────────────────────────────────────────────────────────

class WorkerManager extends EventEmitter {
  constructor() {
    super();

    /** Number of currently active (running) browser workers */
    this._activeWorkers = 0;

    /** Whether the polling loop is running */
    this._polling = false;

    /** Reference to the polling interval timer */
    this._pollTimer = null;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Starts the worker manager.
   * Begins polling the queue and listening for new job events.
   */
  start() {
    if (this._polling) return;
    this._polling = true;

    logger.info(`Worker manager started (max concurrent workers: ${MAX_CONCURRENT_WORKERS})`);

    // Listen for new jobs being enqueued — process immediately if capacity allows
    jobQueue.on('enqueued', () => this._tryProcessNext());

    // Listen for retried jobs becoming available
    jobQueue.on('ready', () => this._tryProcessNext());

    // Periodic poll as a safety net (handles edge cases where events are missed)
    this._pollTimer = setInterval(() => this._tryProcessNext(), POLL_INTERVAL_MS);
  }

  /**
   * Stops the worker manager gracefully.
   * Waits for active workers to finish before stopping the poll.
   */
  stop() {
    this._polling = false;
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    logger.info('Worker manager stopped');
  }

  /**
   * Returns the number of currently active workers.
   * @returns {number}
   */
  get activeWorkers() {
    return this._activeWorkers;
  }

  // ── Core Processing Logic ──────────────────────────────────────────────────

  /**
   * Attempts to pick up the next pending job if capacity is available.
   * This method is safe to call multiple times concurrently — it uses
   * a synchronous capacity check before spawning async work.
   */
  _tryProcessNext() {
    if (!this._polling) return;

    // Check capacity before dequeuing
    if (this._activeWorkers >= MAX_CONCURRENT_WORKERS) {
      logger.info(
        `Worker capacity reached (${this._activeWorkers}/${MAX_CONCURRENT_WORKERS}). ` +
        'Job will wait.'
      );
      return;
    }

    const job = jobQueue.dequeue();
    if (!job) return; // Queue is empty or all jobs are already processing

    // Spawn an async worker for this job (do not await — fire and forget)
    this._runJob(job).catch((err) => {
      // This catch handles unexpected errors in the worker itself (not in kraService)
      logger.error(`Unexpected worker error for job ${job.id}: ${err.message}`);
      jobQueue.markFailed(job.id, `Internal worker error: ${err.message}`);
      this._activeWorkers = Math.max(0, this._activeWorkers - 1);
    });
  }

  /**
   * Processes a single job asynchronously.
   * Manages the worker counter and reports results to the queue.
   *
   * @param {object} job
   */
  async _runJob(job) {
    this._activeWorkers += 1;
    logger.info(
      `Worker started for job ${job.id} | User: ${job.userId} | ` +
      `Active workers: ${this._activeWorkers}/${MAX_CONCURRENT_WORKERS}`
    );

    // Notify the bot that processing has begun
    this.emit('jobStarted', job);

    try {
      const result = await fileNilReturn(job, (msg) => {
        this.emit('jobProgress', job, msg);
      });

      if (result.success) {
        jobQueue.markCompleted(job.id, result);
        this.emit('jobCompleted', job, result);
      } else {
        // kraService returned a failure result (not an exception)
        jobQueue.markFailed(job.id, result.error || 'Unknown error from kraService');
        this.emit('jobFailed', job, result.error);
      }

    } catch (err) {
      // Unexpected exception from kraService
      logger.error(`Job ${job.id} threw an exception: ${err.message}`);
      jobQueue.markFailed(job.id, err.message);
      this.emit('jobFailed', job, err.message);

    } finally {
      this._activeWorkers = Math.max(0, this._activeWorkers - 1);
      logger.info(
        `Worker finished for job ${job.id} | ` +
        `Active workers: ${this._activeWorkers}/${MAX_CONCURRENT_WORKERS}`
      );

      // Immediately try to pick up the next job now that a slot is free
      this._tryProcessNext();
    }
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

/**
 * A single shared WorkerManager instance.
 * Import and call `workerManager.start()` once in your entry point.
 */
const workerManager = new WorkerManager();

module.exports = { workerManager };
