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
      '--window-size=1366,768'
    ],
    defaultViewport: { width: 1366, height: 768 },
  });
}

async function fileNilReturn(kraPin, password) {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    
    // Memory optimization
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'font'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    console.log('[STEP] Navigating to KRA portal...');
    await page.goto(KRA_ITAX_URL, { waitUntil: 'networkidle2', timeout: 120000 });

    // 1. Enter PIN (The field is usually 'logid')
    console.log('[STEP] Entering PIN...');
    const pinSelector = await page.waitForSelector('input#logid, input[name="logid"], input[name="vo.userId"]', { visible: true, timeout: 60000 });
    await pinSelector.type(kraPin, { delay: 100 });
    await page.click('a[href="javascript:loginContinue()"]');

    // 2. Handle "Already Logged In"
    try {
      const conflict = 'a[href="javascript:terminateSession(\'Y\')"]';
      await page.waitForSelector(conflict, { visible: true, timeout: 10000 });
      await page.click(conflict);
    } catch (e) {}

    // 3. Find Password Field (SMART SEARCH: Look for any password input)
    console.log('[STEP] Finding Password field...');
    const passSelector = 'input[type="password"]';
    await page.waitForSelector(passSelector, { visible: true, timeout: 60000 });
    await page.type(passSelector, password, { delay: 100 });

    // 4. Solve CAPTCHA
    console.log('[STEP] Solving CAPTCHA...');
    const captchaData = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('label'));
      const captchaLabel = labels.find(l => l.innerText.includes('+') || l.innerText.includes('-'));
      if (!captchaLabel) return null;
      const text = captchaLabel.innerText;
      const match = text.match(/(\d+)\s*([\+\-])\s*(\d+)/);
      if (!match) return null;
      return { n1: parseInt(match[1]), op: match[2], n2: parseInt(match[3]) };
    });

    if (!captchaData) throw new Error("Could not find CAPTCHA expression");
    const answer = captchaData.op === '+' ? captchaData.n1 + captchaData.n2 : captchaData.n1 - captchaData.n2;
    
    // CAPTCHA field is usually 'captcahText'
    await page.type('input#captcahText, input[name="captcahText"]', answer.toString(), { delay: 100 });
    
    // 5. Click Login
    await page.click('a#loginButton, a[href="javascript:loginUser()"]');

    // 6. Dashboard & Filing
    await page.waitForSelector('#headerNav', { visible: true, timeout: 60000 });
    console.log('[STEP] Login successful!');

    await page.click('a[title="Returns"]');
    await new Promise(r => setTimeout(r, 2000));
    await page.click('a[title="File Nil Return"]');

    await page.waitForSelector('select[name="vo.taxObligation"]', { visible: true, timeout: 45000 });
    await page.select('select[name="vo.taxObligation"]', 'Income Tax - Resident Individual');
    await page.click('a[href="javascript:submitNilReturn()"]');

    // 7. Final Confirm
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

