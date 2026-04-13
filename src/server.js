require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');
const kraService = require('./kraService');
const app = express();

app.get('/', (req, res) => res.send('KRA Bot is Online!'));
app.listen(process.env.PORT || 3000, () => console.log('[INFO] Web server started'));

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const queue = [];
let isProcessing = false;

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "Welcome! Use /nilreturn to start.");
});

bot.onText(/\/nilreturn/, (msg) => {
    bot.sendMessage(msg.chat.id, "Please provide your KRA PIN:");
    bot.once('message', (pinMsg) => {
        const pin = pinMsg.text.trim();
        bot.sendMessage(msg.chat.id, "Please provide your KRA Password:");
        bot.once('message', (passMsg) => {
            const password = passMsg.text.trim();
            const jobId = uuidv4();
            queue.push({ chatId: msg.chat.id, pin, password, jobId });
            bot.sendMessage(msg.chat.id, `Job added to queue! Position: ${queue.length}`);
            processQueue();
        });
    });
});

async function processQueue() {
    if (isProcessing || queue.length === 0) return;
    isProcessing = true;
    const job = queue.shift();
    bot.sendMessage(job.chatId, "🚀 Starting your KRA NIL return filing...");
    try {
        const result = await kraService.fileNilReturn(job.pin, job.password);
        if (result.success) {
            bot.sendMessage(job.chatId, `✅ Success! Acknowledgement No: ${result.acknowledgementNo}`);
        } else {
            bot.sendMessage(job.chatId, `❌ Failed: ${result.error}`);
        }
    } catch (error) {
        bot.sendMessage(job.chatId, "❌ An unexpected error occurred.");
    } finally {
        isProcessing = false;
        processQueue();
    }
}


