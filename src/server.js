'use strict';

/**
 * server.js
 *
 * Entry point for the application.
 * Starts an Express server to satisfy Render's health check requirement
 * and initializes the Telegram bot.
 */

require('dotenv').config();
const express = require('express');
const logger = require('./logger');

// Initialize the Telegram bot (this also starts the worker manager)
const { bot } = require('./bot');

const app = express();
const PORT = process.env.PORT || 3000;

// Basic health check endpoint for Render
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'online',
    message: 'KRA NIL Return Bot is running',
    timestamp: new Date().toISOString()
  });
});

// Start the Express server
app.listen(PORT, () => {
  logger.info(`Web server started on port ${PORT}`);
  logger.info('Bot is active and listening for Telegram messages');
});
