'use strict';
const TelegramBot = require('node-telegram-bot-api');
const kraService = require('./kraService');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });
const userState = {};

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text) return;

  if (text === '/start') {
    delete userState[chatId];
    return bot.sendMessage(chatId, "Welcome! 🚀 Use /nilreturn to start.");
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
    bot.sendMessage(chatId, "🚀 Starting KRA NIL return... (Wait up to 3 mins)");
    const result = await kraService.fileNilReturn(state.pin, state.password);
    if (result.success) {
      bot.sendMessage(chatId, `✅ SUCCESS! Ack No: ${result.acknowledgementNo}`);
    } else {
      bot.sendMessage(chatId, `❌ FAILED: ${result.error}`);
    }
    delete userState[chatId];
  }
});

