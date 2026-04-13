'use strict';

/**
 * logger.js
 *
 * Lightweight structured logger for the KRA bot system.
 * Outputs timestamped, labelled log lines to stdout and a log file.
 */

const fs = require('fs');
const path = require('path');

const timestamp = () => new Date().toISOString();
const LOG_FILE = path.resolve(process.env.LOG_FILE || './logs/app.log');

// Ensure the logs directory exists
const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

function writeToLog(level, message) {
  const logLine = `[${timestamp()}] [${level}] ${message}\n`;
  process.stdout.write(logLine);
  try {
    fs.appendFileSync(LOG_FILE, logLine, 'utf8');
  } catch (err) {
    // Fallback if file writing fails
  }
}

function step(message) {
  writeToLog('STEP ', message);
}

function info(message) {
  writeToLog('INFO ', message);
}

function warn(message) {
  writeToLog('WARN ', message);
}

function error(message) {
  writeToLog('ERROR', message);
}

module.exports = { step, info, warn, error };
