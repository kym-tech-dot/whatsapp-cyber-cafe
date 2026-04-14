'use strict';

const TelegramBot = require('node-telegram-bot-api');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
require('dotenv').config();

puppeteer.use(StealthPlugin());

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const userState = {};

console.log('--- E-Cyber Assistant V13 (Industrial) is Starting ---');

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
    
    bot.sendMessage(chatId, "🚀 Starting KRA NIL return... (Wait up to 5 mins)");

    let browser;
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
      });
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

      // 1. Navigate to KRA
      await page.goto('https://itax.kra.go.ke/KRA-Portal/', { waitUntil: 'networkidle2', timeout: 180000 } );

      // 2. Enter PIN
      await page.waitForSelector('input#logid', { visible: true, timeout: 60000 });
      await page.type('input#logid', state.pin, { delay: 100 });
      await page.click('a[href="javascript:loginContinue()"]');

      // 3. Wait for Password & CAPTCHA
      await page.waitForSelector('input[type="password"]', { visible: true, timeout: 60000 });
      
      // 4. Solve CAPTCHA
      const captcha = await page.evaluate(() => {
        const label = Array.from(document.querySelectorAll('label')).find(l => l.innerText.includes('+') || l.innerText.includes('-'));
        if (!label) return null;
        const match = label.innerText.match(/(\d+)\s*([\+\-])\s*(\d+)/);
        return match ? eval(`${match[1]}${match[2]}${match[3]}`) : null;
      });

      if (!captcha) throw new Error("KRA Portal is slow - CAPTCHA not found. Please try again.");
      await page.type('input#captcahText', captcha.toString());

      // 5. HUMAN-LIKE PASSWORD INJECTION (Bypasses Virtual Keyboard)
      await page.evaluate((pass) => {
        const passField = document.querySelector('input[type="password"]');
        passField.value = pass;
        // Trigger KRA's internal validation so the Login button works
        passField.dispatchEvent(new Event('input', { bubbles: true }));
        passField.dispatchEvent(new Event('blur', { bubbles: true }));
      }, state.password);

      await new Promise(r => setTimeout(r, 1000));
      await page.click('a#loginButton');

      // 6. Dashboard & Filing
      await page.waitForSelector('#headerNav', { visible: true, timeout: 90000 });
      await page.click('a[title="Returns"]');
      await new Promise(r => setTimeout(r, 2000));
      await page.click('a[title="File Nil Return"]');

      // 7. Form Selection
      await page.waitForSelector('select[name="vo.taxObligation"]', { visible: true });
      await page.select('select[name="vo.taxObligation"]', 'Income Tax - Resident Individual');
      await page.click('a[href="javascript:submitNilReturn()"]');

      // 8. Final Confirm
      await page.waitForSelector('a[href="javascript:confirmNilReturn()"]', { visible: true });
      await page.click('a[href="javascript:confirmNilReturn()"]');
      
      // 9. Get Acknowledgement
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
