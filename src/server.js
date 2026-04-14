'use strict';
const TelegramBot = require('node-telegram-bot-api');
const kraService = require('./kraService');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("ERROR: TELEGRAM_BOT_TOKEN is missing in Environment Variables!");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const userState = {};

console.log('--- E-Cyber Assistant V20 (Stable) is Starting ---');

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text) return;

  if (text === '/start') {
    delete userState[chatId];
    return bot.sendMessage(chatId, "Welcome! 🚀 (V20 ACTIVE)\n\nUse /nilreturn to start.");
  }

  if (text === '/nilreturn') {
    userState[chatId] = { step: 'awaiting_pin' };
    return bot.sendMessage(chatId, "Please provide your KRA PIN:");
  }

  const state = userState[chatId];
  if (!state) return;

  if (state.step === 'awaiting_pin') {
    state.pin = text.toUpperCase().trim();
    state.step = 'awaiting_password';
    return bot.sendMessage(chatId, "Please provide your KRA Password:");
  } 
  
  if (state.step === 'awaiting_password') {
    state.password = text.trim();
    state.step = 'processing';
    bot.sendMessage(chatId, "🚀 V20: Starting KRA NIL return... (Wait up to 3 mins)");
    
    try {
      const result = await kraService.fileNilReturn(state.pin, state.password);
      if (result.success) {
        bot.sendMessage(chatId, `✅ SUCCESS! Ack No: ${result.acknowledgementNo}`);
      } else {
        bot.sendMessage(chatId, `❌ FAILED: ${result.error}`);
      }
    } catch (err) {
      bot.sendMessage(chatId, `❌ ERROR: ${err.message}`);
    } finally {
      delete userState[chatId];
    }
  }
});

bot.on('polling_error', (err) => console.log(`[POLLING ERROR] ${err.message}`));
