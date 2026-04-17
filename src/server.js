'use strict';
const TelegramBot = require('node-telegram-bot-api');
const kraService = require('./kraService');
const http = require('http' );
require('dotenv').config();

const server = http.createServer((req, res ) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is alive\n');
});
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server on port ${PORT}`));

const token = process.env.TELEGRAM_BOT_TOKEN;

// 1. START WITH POLLING DISABLED TO PREVENT CONFLICT
const bot = new TelegramBot(token, { polling: false });

// 2. FORCE KILL OTHER INSTANCES BEFORE STARTING
async function startBot() {
  try {
    console.log('--- KILLING OLD BOT INSTANCES ---');
    await bot.deleteWebHook(); // Clear any old webhooks
    await bot.getUpdates({ offset: -1 }); // Clear old messages
    
    console.log('--- E-Cyber Assistant V31 (Conflict Killer) is Starting ---');
    bot.startPolling(); // Now start fresh
  } catch (e) {
    console.error('Error during startup:', e.message);
  }
}

startBot();

const userState = {};

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text) return;

  if (text === '/start') {
    delete userState[chatId];
    return bot.sendMessage(chatId, "Welcome! 🚀 (V31 ACTIVE)\n\nUse /nilreturn to start.");
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
    bot.sendMessage(chatId, "🚀 V31: Starting KRA NIL return... (Wait up to 5 mins)");
    const result = await kraService.fileNilReturn(state.pin, state.password);
    if (result.success) {
      bot.sendMessage(chatId, `✅ SUCCESS! Ack No: ${result.acknowledgementNo}`);
    } else {
      bot.sendMessage(chatId, `❌ FAILED: ${result.error}`);
    }
    delete userState[chatId];
  }
});

bot.on('polling_error', (err) => {
  if (err.message.includes('409 Conflict')) {
    console.log('--- CONFLICT DETECTED: RESTARTING BOT ---');
    process.exit(1); // Force Render to restart the container
  }
});
