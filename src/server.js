require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');
const kraService = require('./kraService'); // Import the automation logic
const app = express();

// Health check for Render
app.get('/', (req, res) => res.send('KRA NIL Return Bot is Online!'));
app.listen(process.env.PORT || 3000, () => console.log('[INFO] Web server started'));

// Connect to Telegram
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    console.error('[ERROR] TELEGRAM_BOT_TOKEN is not set!');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
console.log('[INFO] Bot is active and listening...');

// Simple Queue System
const queue = [];
let isProcessing = false;

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "Welcome to the KRA NIL Return Bot! 🇰🇪\n\nUse /nilreturn to start filing your NIL return.");
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
            bot.sendMessage(msg.chat.id, `Job added to queue! You are number ${queue.length} in line.`);
            processQueue(); // Start processing the queue
        });
    });
});

async function processQueue() {
    if (isProcessing || queue.length === 0) return;
    
    isProcessing = true;
    const job = queue.shift();
    
    bot.sendMessage(job.chatId, "🚀 Starting your KRA NIL return filing. Please wait...");
    
    try {
        // Call the automation logic
        const result = await kraService.fileNilReturn(job.pin, job.password);
        
        if (result.success) {
            bot.sendMessage(job.chatId, `✅ Success! Your NIL return has been filed.\n\nAcknowledgement No: ${result.acknowledgementNo}`);
        } else {
            bot.sendMessage(job.chatId, `❌ Filing Failed: ${result.error}\n\nPlease try again later.`);
        }
    } catch (error) {
        console.error(`[ERROR] Job ${job.jobId} failed:`, error);
        bot.sendMessage(job.chatId, "❌ An unexpected error occurred. Please try again later.");
    } finally {
        isProcessing = false;
        processQueue(); // Process the next job in the queue
    }
}

bot.on('polling_error', (error) => {
    console.error('[ERROR] Telegram polling error:', error.code);
});
