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
      '--window-size=1280,800'
    ],
    defaultViewport: { width: 1280, height: 800 },
  });
}

async function fileNilReturn(kraPin, password) {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    
    // Memory optimization: Block images/CSS
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log('[STEP] Navigating to KRA portal (Waiting up to 3 mins)');
    // Increased navigation timeout to 3 minutes
    await page.goto(KRA_ITAX_URL, { waitUntil: 'domcontentloaded', timeout: 180000 });

    // AGGRESSIVE POP-UP KILLER
    await page.evaluate(() => {
      const selectors = ['.modal-backdrop', '.modal', '#closeButton', 'button', 'a'];
      selectors.forEach(s => {
        try {
          const elements = document.querySelectorAll(s);
          elements.forEach(el => {
            const text = el.innerText.toLowerCase();
            if (text.includes('close') || text === 'x' || s === '.modal-backdrop') {
              el.remove();
            }
          });
        } catch(e) {}
      });
    });

    console.log('[STEP] Waiting for PIN field (3-minute limit)...');
    // PARALLEL SEARCH with 3-minute timeout (180,000ms)
    const pinField = await Promise.race([
      page.waitForSelector('input[name="vo.userId"]', { visible: true, timeout: 180000 }).then(() => 'input[name="vo.userId"]'),
      page.waitForSelector('input[name="vo.username"]', { visible: true, timeout: 180000 }).then(() => 'input[name="vo.username"]')
    ]);

    console.log(`[INFO] Found PIN field: ${pinField}`);
    await page.type(pinField, kraPin, { delay: 50 });
    await page.click('a[href="javascript:loginContinue()"]');

    // Handle "Already Logged In"
    try {
      const conflict = 'a[href="javascript:terminateSession(\'Y\')"]';
      await page.waitForSelector(conflict, { visible: true, timeout: 15000 });
      await page.click(conflict);
    } catch (e) {}

    // Password & CAPTCHA
    console.log('[STEP] Waiting for Password & CAPTCHA...');
    await page.waitForSelector('input[name="vo.password"]', { visible: true, timeout: 60000 });
    
    const captcha = await page.evaluate(() => {
      const label = document.querySelector('label[for="captchatext"]');
      if (!label) return null;
      const text = label.innerText;
      const match = text.match(/(\d+)\s*([\+\-])\s*(\d+)/);
      if (!match) return null;
      const n1 = parseInt(match[1]), op = match[2], n2 = parseInt(match[3]);
      return op === '+' ? n1 + n2 : n1 - n2;
    });

    if (captcha === null) throw new Error("Could not solve CAPTCHA - Portal might be lagging");
    
    await page.type('input[name="captchatext"]', captcha.toString());
    await page.type('input[name="vo.password"]', password);
    await page.click('a[href="javascript:loginUser()"]');

    // Dashboard
    await page.waitForSelector('#headerNav', { visible: true, timeout: 60000 });
    console.log('[STEP] Login successful!');

    // Filing
    await page.click('a[title="Returns"]');
    await new Promise(r => setTimeout(r, 2000));
    await page.click('a[title="File Nil Return"]');

    await page.waitForSelector('select[name="vo.taxObligation"]', { visible: true, timeout: 45000 });
    await page.select('select[name="vo.taxObligation"]', 'Income Tax - Resident Individual');
    await page.click('a[href="javascript:submitNilReturn()"]');

    // Final Confirm
    await page.waitForSelector('a[href="javascript:confirmNilReturn()"]', { visible: true, timeout: 30000 });
    await page.click('a[href="javascript:confirmNilReturn()"]');
    
    await page.waitForSelector('#acknowledgementNo', { visible: true, timeout: 60000 });
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

