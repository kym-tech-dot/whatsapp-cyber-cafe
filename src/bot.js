
'use strict';

/**
 * bot.js
 *
 * Telegram bot interface for the KRA NIL return automation system.
 *
 * Responsibilities:
 *  - Handle the /start and /nilreturn commands.
 *  - Collect KRA PIN and password via a multi-step conversation.
 *  - Enqueue jobs and provide real-time queue position feedback.
 *  - Listen to worker events and send completion/failure messages.
 *  - Sanitise user input and protect credentials in memory.
 *
 * Conversation flow:
 *  /nilreturn -> ask for KRA PIN -> ask for password -> enqueue -> feedback
 *
 * Security note:
 *  Passwords are held in memory only for the duration of the conversation
 *  and are never logged. The job object in the queue also stores the password
 *  in memory only - it is never written to disk or a database.
 */

require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const { jobQueue } = require('./queue');
const { workerManager } = require('./worker');
const logger = require('./logger');

// --- Bot Initialisation -------------------------------------------------------

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  logger.error('TELEGRAM_BOT_TOKEN is not set in environment variables. Exiting.');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
logger.info('Telegram bot started and polling for messages');

// Start the worker manager so jobs are processed automatically
workerManager.start();

// --- Conversation State -------------------------------------------------------

/**
 * Stores the multi-step conversation state for each user.
 * Key: Telegram chat ID (string)
 * Value: { step: 'awaitingPin' | 'awaitingPassword', kraPin?: string }
 *
 * State is cleared after a job is enqueued or on /cancel.
 */
const conversationState = new Map();

// --- Command Handlers ---------------------------------------------------------

/**
 * /start - Welcome message and instructions.
 */
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    `👋 *Welcome to the KRA NIL Return Bot!*\n\n` +
    `This bot automates the filing of KRA iTax NIL returns on your behalf.\n\n` +
    `*Commands:*\n` +
    `/nilreturn - File a NIL return\n` +
    `/status - Check queue status\n` +
    `/cancel - Cancel an ongoing operation\n\n` +
    `⚠️ *Security reminder:* Your password is used only to log in and is never stored permanently.`,
    { parse_mode: 'Markdown' }
  );
});

/**
 * /nilreturn - Begins the NIL return filing conversation.
 */
bot.onText(/\/nilreturn/, (msg) => {
  const chatId = msg.chat.id;

  // Clear any existing conversation state for this user
  conversationState.delete(chatId);

  conversationState.set(chatId, { step: 'awaitingPin' });

  bot.sendMessage(
    chatId,
    `📋 *File NIL Return*\n\nPlease enter your *KRA PIN* (e.g. A001234567P):`,
    { parse_mode: 'Markdown' }
  );
});

/**
 * /status - Shows the current queue depth.
 */
bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  const pending = jobQueue.pendingCount;
  const processing = jobQueue.processingCount;

  bot.sendMessage(
    chatId,
    `📊 *Queue Status*\n\n` +
    `⏳ Pending jobs: ${pending}\n` +
    `🔄 Processing: ${processing}\n` +
    `🖥️ Active workers: ${workerManager.activeWorkers}`,
    { parse_mode: 'Markdown' }
  );
});

/**
 * /cancel - Cancels the current conversation.
 */
bot.onText(/\/cancel/, (msg) => {
  const chatId = msg.chat.id;
  conversationState.delete(chatId);
  bot.sendMessage(chatId, '❌ Operation cancelled. Use /nilreturn to start again.');
});

// --- Message Handler (Conversation State Machine) -----------------------------

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  // Ignore commands (handled by onText above) and empty messages
  if (!text || text.startsWith('/')) return;

  const state = conversationState.get(chatId);
  if (!state) return; // No active conversation for this user

  // --- Step 1: Collect KRA PIN -----------------------------------------------
  if (state.step === 'awaitingPin') {
    const kraPin = text.toUpperCase();

    // Basic KRA PIN format validation (letter + 9 digits + letter)
    if (!/^[A-Z]\d{9}[A-Z]$/.test(kraPin)) {
      bot.sendMessage(
        chatId,
        `⚠️ That doesn't look like a valid KRA PIN.\n` +
        `A KRA PIN has the format *A001234567P* (letter, 9 digits, letter).\n\n` +
        `Please try again or use /cancel to stop.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    state.kraPin = kraPin;
    state.step = 'awaitingPassword';
    conversationState.set(chatId, state);

    bot.sendMessage(
      chatId,
      `✅ PIN accepted.\n\nNow please enter your *iTax password*:\n\n` +
      `_(Your password is used only to log in and is never saved.)_`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // --- Step 2: Collect Password and Enqueue ----------------------------------
  if (state.step === 'awaitingPassword') {
    const password = text; // Do NOT trim - passwords may have leading/trailing spaces

    // Clear conversation state immediately after capturing the password
    conversationState.delete(chatId);

    // Enqueue the job
    const job = jobQueue.enqueue({
      userId: chatId,
      kraPin: state.kraPin,
      password,
    });

    const position = jobQueue.getPosition(job.id);

    if (position === 1 && jobQueue.processingCount === 0) {
      // Job will be picked up almost immediately
      bot.sendMessage(
        chatId,
        `⏳ Your NIL return request has been received.\n\n` +
        `You are *#${position}* in the queue - processing will begin shortly.`,
        { parse_mode: 'Markdown' }
      );
    } else {
      bot.sendMessage(
        chatId,
        `⏳ Your NIL return request has been received.\n\n` +
        `You are *#${position}* in the queue. We will notify you when processing begins.`,
        { parse_mode: 'Markdown' }
      );
    }

    logger.info(`Job enqueued for user ${chatId} | PIN: ${state.kraPin} | Queue position: ${position}`);
  }
});

// --- Worker Event Handlers ----------------------------------------------------

/**
 * Notifies the user when their job moves from pending to actively processing.
 */
workerManager.on('jobStarted', (job) => {
  bot.sendMessage(
    job.userId,
    `🚀 *Your KRA NIL return is now being processed.*\n\n` +
    `Please wait - this may take up to 2 minutes depending on the KRA portal speed.`,
    { parse_mode: 'Markdown' }
  ).then((sentMsg) => {
    // Store the message ID to update it later if desired, 
    // but for now we just use it as a reference.
    job.statusMessageId = sentMsg.message_id;
  }).catch((err) => logger.error(`Failed to send jobStarted message: ${err.message}`));
});

/**
 * Notifies the user of granular progress updates.
 */
workerManager.on('jobProgress', (job, message) => {
  // We can either send new messages or just log it. 
  // To avoid spamming, we'll only send significant milestones.
  const milestones = ['Inatatua CAPTCHA...', 'Inafanya Nil Return...', 'Dashboard...'];
  if (milestones.some(m => message.includes(m))) {
    bot.sendMessage(job.userId, `🔄 ${message}`)
      .catch((err) => logger.error(`Failed to send progress message: ${err.message}`));
  }
});

/**
 * Notifies the user of a successful NIL return filing.
 */
workerManager.on('jobCompleted', (job, result) => {
  const ackLine = result.acknowledgementNumber && result.acknowledgementNumber !== 'N/A'
    ? `\n\n📄 *Acknowledgement No:* \`${result.acknowledgementNumber}\``
    : '';

  bot.sendMessage(
    job.userId,
    `✅ *NIL return filed successfully!*${ackLine}\n\n` +
    `Your KRA NIL return for PIN *${job.kraPin}* has been submitted.\n` +
    `Keep the acknowledgement number for your records.`,
    { parse_mode: 'Markdown' }
  ).catch((err) => logger.error(`Failed to send jobCompleted message: ${err.message}`));
});

/**
 * Notifies the user when their job is being retried.
 */
jobQueue.on('retrying', (job, attempt) => {
  bot.sendMessage(
    job.userId,
    `⚠️ There was an issue processing your NIL return. ` +
    `Retrying automatically (attempt ${attempt + 1} of ${3})...`,
    { parse_mode: 'Markdown' }
  ).catch((err) => logger.error(`Failed to send retrying message: ${err.message}`));
});

/**
 * Notifies the user when their job has permanently failed after all retries.
 */
workerManager.on('jobFailed', (job, errorMessage) => {
  // Only send the final failure message if the queue has also given up
  // (i.e., the job is no longer going to be retried)
  jobQueue.once('failed', (failedJob) => {
    if (failedJob.id !== job.id) return;

    bot.sendMessage(
      job.userId,
      `❌ *NIL return filing failed.*\n\n` +
      `We were unable to file your NIL return for PIN *${job.kraPin}* after multiple attempts.\n\n` +
      `*Reason:* ${sanitiseErrorMessage(errorMessage)}\n\n` +
      `Please try again later with /nilreturn, or contact support if the issue persists.`,
      { parse_mode: 'Markdown' }
    ).catch((err) => logger.error(`Failed to send jobFailed message: ${err.message}`));
  });
});

// --- Error Handling -----------------------------------------------------------

bot.on('polling_error', (err) => {
  logger.error(`Telegram polling error: ${err.message}`);
});

bot.on('error', (err) => {
  logger.error(`Telegram bot error: ${err.message}`);
});

// --- Utilities ----------------------------------------------------------------

/**
 * Strips sensitive information from error messages before sending to users.
 * Prevents accidental leakage of credentials or internal paths.
 *
 * @param {string} message
 * @returns {string}
 */
function sanitiseErrorMessage(message) {
  if (!message) return 'Unknown error';
  // Truncate very long error messages
  const truncated = message.length > 200 ? message.substring(0, 200) + '...' : message;
  // Remove file paths
  return truncated.replace(/\/[^\s]+/g, '[path]');
}

module.exports = { bot };
