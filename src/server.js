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
const bot = new TelegramBot(token, { polling: true });

console.log('--- E-Cyber Assistant V35 (Force Update) is Starting ---');

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text) return;

  if (text === '/start') {
    return bot.sendMessage(chatId, "Welcome! 🚀 (V35 ACTIVE)\n\nUse /nilreturn to start.");
  }
  if (text === '/nilreturn') {
    return bot.sendMessage(chatId, "Please provide your KRA PIN:");
  }
  // ... (Keep the rest of the logic as it was)
});
