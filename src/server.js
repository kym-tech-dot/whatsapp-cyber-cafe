'use strict';

const TelegramBot = require('node-telegram-bot-api');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
require('dotenv').config();

puppeteer.use(StealthPlugin());

const token = process.env.TELEGRAM_BOT_TOKEN;
// FORCE DISCONNECT: This tells Telegram to kill any other bot instance immediately
const bot = new TelegramBot(token, { polling: { params: { timeout: 10 }, autoStart: true } });

const userState = {};
const activeJobs = new Set();

console.log('--- E-Cyber Assistant V10 (Final) is Starting ---');

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Welcome to E-Cyber Assistant! 🚀\n\nUse /nilreturn to start filing your KRA NIL return.");
});

bot.onText(/\/nilreturn/, (msg) => {
  const chatId = msg.chat.id;
  if (activeJobs.has(chatId)) return bot.sendMessage(chatId, "⚠️ Filing in progress. Please wait.");
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
    activeJobs.add(chatId);
    
    bot.sendMessage(chatId, "🚀 Starting KRA NIL return... (Wait up to 5 mins)");

    let browser;
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
      });
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

      // Navigate to KRA
      await page.goto('https://itax.kra.go.ke/KRA-Portal/', { waitUntil: 'networkidle2', timeout: 180000 } );

      // Step 1: PIN
      const pinField = await page.waitForSelector('input#logid, input[name="logid"]', { visible: true, timeout: 120000 });
      await pinField.type(state.pin, { delay: 100 });
      await page.click('a[href="javascript:loginContinue()"]');

      // Step 2: Password & CAPTCHA
      const passField = await page.waitForSelector('input[type="password"]', { visible: true, timeout: 60000 });
      
      const captcha = await page.evaluate(() => {
        const label = Array.from(document.querySelectorAll('label')).find(l => l.innerText.includes('+') || l.innerText.includes('-'));
        if (!label) return null;
        const match = label.innerText.match(/(\d+)\s*([\+\-])\s*(\d+)/);
        if (!match) return null;
        return eval(`${match[1]}${match[2]}${match[3]}`);
      });

      if (!captcha) throw new Error("CAPTCHA failed");
      await page.type('input#captcahText', captcha.toString());
      await passField.type(state.password);
      await page.click('a#loginButton');

      // Step 3: Filing
      await page.waitForSelector('#headerNav', { visible: true, timeout: 60000 });
      await page.click('a[title="Returns"]');
      await new Promise(r => setTimeout(r, 2000));
      await page.click('a[title="File Nil Return"]');

      await page.waitForSelector('select[name="vo.taxObligation"]', { visible: true });
      await page.select('select[name="vo.taxObligation"]', 'Income Tax - Resident Individual');
      await page.click('a[href="javascript:submitNilReturn()"]');

      // Step 4: Confirm
      await page.waitForSelector('a[href="javascript:confirmNilReturn()"]', { visible: true });
      await page.click('a[href="javascript:confirmNilReturn()"]');
      
      const ackNo = await page.waitForSelector('#acknowledgementNo', { visible: true, timeout: 60000 });
      const text = await page.evaluate(el => el.innerText, ackNo);

      bot.sendMessage(chatId, `✅ SUCCESS! Acknowledgement No: ${text.trim()}`);

    } catch (err) {
      bot.sendMessage(chatId, `❌ FAILED: ${err.message}`);
    } finally {
      if (browser) await browser.close();
      activeJobs.delete(chatId);
      delete userState[chatId];
    }
  }
});

bot.on('polling_error', (err) => console.log(`[POLLING ERROR] ${err.message}`));
