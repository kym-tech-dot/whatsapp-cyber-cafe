'use strict';
const TelegramBot = require('node-telegram-bot-api');
const kraService = require('./kraService');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });
const userState = {};

console.log('--- E-Cyber Assistant V18 (Final) is Starting ---');

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text) return;

  // 1. Reset if user sends /start
  if (text === '/start') {
    delete userState[chatId];
    return bot.sendMessage(chatId, "Welcome! 🚀 (V18 ACTIVE)\n\nUse /nilreturn to start.");
  }

  // 2. Start the process
  if (text === '/nilreturn') {
    userState[chatId] = { step: 'awaiting_pin' };
    return bot.sendMessage(chatId, "Please provide your KRA PIN:");
  }

  // 3. Handle the steps
  const state = userState[chatId];
  if (!state) return;

  if (state.step === 'awaiting_pin') {
    state.pin = text.toUpperCase().trim();
    state.step = 'awaiting_password';
    console.log(`[V18] PIN Received: ${state.pin}`);
    return bot.sendMessage(chatId, "Please provide your KRA Password:");
  } 
  
  if (state.step === 'awaiting_password') {
    state.password = text.trim();
    state.step = 'processing';
    console.log(`[V18] Password Received. Starting filing...`);
    
    bot.sendMessage(chatId, "🚀 V18: Starting KRA NIL return... (Wait up to 3 mins)");
    
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

