'use strict';

const TelegramBot = require('node-telegram-bot-api');
const kraService = require('./kraService');
const http = require('http' ); // Added for Render
require('dotenv').config();

// 1. HEARTBEAT SERVER (Fixes the "Exited Early" error on Render)
const server = http.createServer((req, res ) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is alive\n');
});
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server on port ${PORT}`));

// 2. BOT LOGIC
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });
const userState = {};

console.log('--- E-Cyber Assistant V25 (Two-File) is Starting ---');

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text) return;

  if (text === '/start') {
    delete userState[chatId];
    return bot.sendMessage(chatId, "Welcome! 🚀 (V25 ACTIVE)\n\nUse /nilreturn to start.");
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
    bot.sendMessage(chatId, "🚀 V25: Starting KRA NIL return... (Wait up to 3 mins)");
    
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
