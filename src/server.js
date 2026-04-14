'use strict';

const TelegramBot = require('node-telegram-bot-api');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const http = require('http' );
require('dotenv').config();

puppeteer.use(StealthPlugin());

// 1. DUMMY WEB SERVER (Prevents Render from "Exiting Early")
const server = http.createServer((req, res ) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running...\n');
});
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// 2. BOT LOGIC
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("ERROR: TELEGRAM_BOT_TOKEN is missing!");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const userState = {};

console.log('--- E-Cyber Assistant V22 (All-in-One) is Starting ---');

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text) return;

  if (text === '/start') {
    delete userState[chatId];
    return bot.sendMessage(chatId, "Welcome! 🚀 (V22 ACTIVE)\n\nUse /nilreturn to start.");
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
    bot.sendMessage(chatId, "🚀 V22: Starting KRA NIL return... (Wait up to 3 mins)");
    
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
      });
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

      // KRA Logic
      await page.goto('https://itax.kra.go.ke/KRA-Portal/', { waitUntil: 'networkidle2', timeout: 180000 } );
      
      // Handle Pop-ups
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a, span'));
        buttons.forEach(el => {
          if (el.innerText.toLowerCase().includes('close') || el.innerText === 'X') el.click();
        });
      });

      // PIN
      await page.waitForSelector('input#logid', { visible: true, timeout: 60000 });
      await page.type('input#logid', state.pin, { delay: 100 });
      await page.click('a[href*="loginContinue"]');

      // Password & CAPTCHA
      await page.waitForSelector('input[type="password"]', { visible: true, timeout: 60000 });
      const captcha = await page.evaluate(() => {
        const label = Array.from(document.querySelectorAll('label')).find(l => l.innerText.includes('+') || l.innerText.includes('-'));
        if (!label) return null;
        const match = label.innerText.match(/(\d+)\s*([\+\-])\s*(\d+)/);
        return match ? eval(`${match[1]}${match[2]}${match[3]}`) : null;
      });
      if (!captcha) throw new Error("CAPTCHA not found");
      await page.type('input#captcahText', captcha.toString());

      // Password Injection
      await page.evaluate((pass) => {
        const f = document.querySelector('input[type="password"]');
        f.value = pass;
        f.dispatchEvent(new Event('input', { bubbles: true }));
      }, state.password);
      await new Promise(r => setTimeout(r, 1000));
      await page.click('a#loginButton');

      // Filing
      await page.waitForSelector('#headerNav', { visible: true, timeout: 90000 });
      await page.click('a[title="Returns"]');
      await new Promise(r => setTimeout(r, 2000));
      await page.click('a[title="File Nil Return"]');
      await page.waitForSelector('select[name="vo.taxObligation"]', { visible: true });
      await page.select('select[name="vo.taxObligation"]', 'Income Tax - Resident Individual');
      await page.click('a[href*="submitNilReturn"]');
      await page.waitForSelector('a[href*="confirmNilReturn"]', { visible: true });
      await page.click('a[href*="confirmNilReturn"]');
      
      const ack = await page.waitForSelector('#acknowledgementNo', { visible: true, timeout: 60000 });
      const ackText = await page.evaluate(el => el.innerText, ack);
      bot.sendMessage(chatId, `✅ SUCCESS! Ack No: ${ackText.trim()}`);

    } catch (err) {
      bot.sendMessage(chatId, `❌ FAILED: ${err.message}`);
    } finally {
      if (browser) await browser.close();
      delete userState[chatId];
    }
  }
});
