'use strict';

const TelegramBot = require('node-telegram-bot-api');
const kraService = require('./kraService');
require('dotenv').config();

// Use the token from Environment Variables (Set this on Render!)
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const userState = {};

console.log('--- E-Cyber Assistant Bot is Starting ---');

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Welcome to E-Cyber Assistant! 🚀\n\nUse /nilreturn to start filing your KRA NIL return.");
});

bot.onText(/\/nilreturn/, (msg) => {
  const chatId = msg.chat.id;
  userState[chatId] = { step: 'awaiting_pin' };
  bot.sendMessage(chatId, "Please provide your KRA PIN:");
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!userState[chatId] || text.startsWith('/')) return;

  const state = userState[chatId];

  if (state.step === 'awaiting_pin') {
    state.pin = text.toUpperCase();
    state.step = 'awaiting_password';
    bot.sendMessage(chatId, "Please provide your KRA Password:");
  } 
  else if (state.step === 'awaiting_password') {
    state.password = text;
    state.step = 'processing';
    
    bot.sendMessage(chatId, "🚀 Starting your KRA NIL return filing... This may take up to 3 minutes due to KRA portal delays. Please wait.");

    try {
      // Pass the PIN and Password to the service
      const result = await kraService.fileNilReturn(state.pin, state.password);

      if (result.success) {
        bot.sendMessage(chatId, `✅ SUCCESS! Your NIL return has been filed.\n\nAcknowledgement No: ${result.acknowledgementNo}`);
      } else {
        bot.sendMessage(chatId, `❌ FAILED: ${result.error}\n\nPlease try again later or check your credentials.`);
      }
    } catch (err) {
      bot.sendMessage(chatId, `❌ ERROR: Something went wrong. Please try again.`);
      console.error(err);
    } finally {
      delete userState[chatId];
    }
  }
});

// Handle polling errors (like 409 Conflict)
bot.on('polling_error', (error) => {
  console.log(`[POLLING ERROR] ${error.code}: ${error.message}`);
});


