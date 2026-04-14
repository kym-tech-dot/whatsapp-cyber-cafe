'use strict';

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');

puppeteer.use(StealthPlugin());

const KRA_ITAX_URL = 'https://itax.kra.go.ke/KRA-Portal/';

async function launchBrowser( ) {
  return await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-features=IsolateOrigins,site-per-process',
      '--js-flags="--max-old-space-size=256"' // Memory optimization
    ],
    defaultViewport: { width: 1280, height: 800 },
  });
}

async function fileNilReturn(kraPin, password) {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    
    // MEMORY SAVER: Block images and CSS to prevent "Socket Hang Up"
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log('[STEP] Navigating to KRA portal');
    await page.goto(KRA_ITAX_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });

    // Try both selectors for PIN
    let pinSelector = 'input[name="vo.userId"]';
    try {
      await page.waitForSelector(pinSelector, { visible: true, timeout: 15000 });
    } catch (e) {
      pinSelector = 'input[name="vo.username"]';
      await page.waitForSelector(pinSelector, { visible: true, timeout: 15000 });
    }

    await page.type(pinSelector, kraPin, { delay: 50 });
    await page.click('a[href="javascript:loginContinue()"]');

    // Handle session conflict
    try {
      const conflict = 'a[href="javascript:terminateSession(\'Y\')"]';
      await page.waitForSelector(conflict, { visible: true, timeout: 5000 });
      await page.click(conflict);
    } catch (e) {}

    // Password & CAPTCHA
    await page.waitForSelector('input[name="vo.password"]', { visible: true, timeout: 30000 });
    
    const captcha = await page.evaluate(() => {
      const label = document.querySelector('label[for="captchatext"]');
      if (!label) return null;
      const match = label.innerText.match(/(\d+)\s*([\+\-])\s*(\d+)/);
      if (!match) return null;
      const n1 = parseInt(match[1]), op = match[2], n2 = parseInt(match[3]);
      return op === '+' ? n1 + n2 : n1 - n2;
    });

    if (captcha === null) throw new Error("CAPTCHA failed");
    
    await page.type('input[name="captchatext"]', captcha.toString());
    await page.type('input[name="vo.password"]', password);
    await page.click('a[href="javascript:loginUser()"]');

    // Dashboard
    await page.waitForSelector('#headerNav', { visible: true, timeout: 40000 });
    
    // Filing
    await page.click('a[title="Returns"]');
    await new Promise(r => setTimeout(r, 1000));
    await page.click('a[title="File Nil Return"]');

    await page.waitForSelector('select[name="vo.taxObligation"]', { visible: true });
    await page.select('select[name="vo.taxObligation"]', 'Income Tax - Resident Individual');
    await page.click('a[href="javascript:submitNilReturn()"]');

    // Final Confirm
    await page.waitForSelector('a[href="javascript:confirmNilReturn()"]', { visible: true });
    await page.click('a[href="javascript:confirmNilReturn()"]');
    
    await page.waitForSelector('#acknowledgementNo', { visible: true, timeout: 30000 });
    const ackNo = await page.evaluate(() => document.querySelector('#acknowledgementNo').innerText.trim());

    return { success: true, acknowledgementNo: ackNo };

  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
    return { success: false, error: err.message };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { fileNilReturn };


