'use strict';

/**
 * logger.js
 *
 * Lightweight structured logger for the KRA bot system.
 * Outputs timestamped, labelled log lines to stdout/stderr.
 *
 * Log levels:
 *  [STEP]  — Progress through the automation workflow
 *  [INFO]  — General informational messages
 *  [WARN]  — Non-fatal warnings (e.g. network idle timeout)
 *  [ERROR] — Errors that may require attention
 *
 * In production, replace this module with a library like `winston` or `pino`
 * for structured JSON logs and log-shipping to a monitoring service.
 */

function timestamp() {
  return new Date().toISOString();
}

function step(message) {
  console.log(`[${timestamp()}] [STEP]  ${message}`);
}

function info(message) {
  console.log(`[${timestamp()}] [INFO]  ${message}`);
}

function warn(message) {
  console.warn(`[${timestamp()}] [WARN]  ${message}`);
}

function error(message) {
  console.error(`[${timestamp()}] [ERROR] ${message}`);
}

module.exports = { step, info, warn, error };
