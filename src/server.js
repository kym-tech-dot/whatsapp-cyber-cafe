'use strict';

const TelegramBot = require('node-telegram-bot-api');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
require('dotenv').config();

puppeteer.use(StealthPlugin());

const token = process.env.TELEGRAM_BOT_TOKEN;

// FORCE TAKEOVER: This is the most important line. 
// It tells Telegram to delete any old webhooks and reset the connection.
const bot = new TelegramBot(token, { 
  polling: { 
    autoStart: true,
    params: { timeout: 10 } 
  } 
});

const userState = {};
const processedMessages = new Set();

console.log('--- E-Cyber Assistant V12 (Kill Switch) is Starting ---');

// Clear any old commands or states on startup
bot.getUpdates({ offset: -1 }); 

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const messageId = msg.message_id;

  if (!text) return;
  if (processedMessages.has(messageId)) return;
  processedMessages.add(messageId);
  
  if (processedMessages.size > 50) processedMessages.clear();

  console.log(`[INCOMING] Chat: ${chatId}, Text: ${text}`);

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
    console.log(`[STATE] PIN Received: ${state.pin}. Moving to Password.`);
    return bot.sendMessage(chatId, "Please provide your KRA Password:");
  } 
  
  if (state.step === 'awaiting_password') {
    state.password = text.trim();
    state.step = 'processing';
    
    bot.sendMessage(chatId, "🚀 Starting KRA NIL return... (Wait up to 5 mins)");

    let browser;
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
      });
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

      await page.goto('https://itax.kra.go.ke/KRA-Portal/', { waitUntil: 'networkidle2', timeout: 180000 } );

      // PIN
      const pinField = await page.waitForSelector('input#logid, input[name="logid"]', { visible: true, timeout: 120000 });
      await pinField.type(state.pin, { delay: 100 });
      await page.click('a[href="javascript:loginContinue()"]');

      // Password & CAPTCHA
      const passField = await page.waitForSelector('input[type="password"]', { visible: true, timeout: 60000 });
      const captcha = await page.evaluate(() => {
        const label = Array.from(document.querySelectorAll('label')).find(l => l.innerText.includes('+') || l.innerText.includes('-'));
        if (!label) return null;
        const match = label.innerText.match(/(\d+)\s*([\+\-])\s*(\d+)/);
        return match ? eval(`${match[1]}${match[2]}${match[3]}`) : null;
      });

      if (!captcha) throw new Error("CAPTCHA failed");
      await page.type('input#captcahText', captcha.toString());
      await passField.type(state.password);
      await page.click('a#loginButton');

      // Filing
      await page.waitForSelector('#headerNav', { visible: true, timeout: 60000 });
      await page.click('a[title="Returns"]');
      await new Promise(r => setTimeout(r, 2000));
      await page.click('a[title="File Nil Return"]');

      await page.waitForSelector('select[name="vo.taxObligation"]', { visible: true });
      await page.select('select[name="vo.taxObligation"]', 'Income Tax - Resident Individual');
      await page.click('a[href="javascript:submitNilReturn()"]');

      // Confirm
      await page.waitForSelector('a[href="javascript:confirmNilReturn()"]', { visible: true });
      await page.click('a[href="javascript:confirmNilReturn()"]');
      
      const ackNo = await page.waitForSelector('#acknowledgementNo', { visible: true, timeout: 60000 });
      const ackText = await page.evaluate(el => el.innerText, ackNo);

      bot.sendMessage(chatId, `✅ SUCCESS! Acknowledgement No: ${ackText.trim()}`);

    } catch (err) {
      bot.sendMessage(chatId, `❌ FAILED: ${err.message}`);
    } finally {
      if (browser) await browser.close();
      delete userState[chatId];
    }
  }
});

bot.on('polling_error', (err) => console.log(`[POLLING ERROR] ${err.message}`));
