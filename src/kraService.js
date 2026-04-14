'use strict';

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');

// Apply stealth plugin to avoid bot detection
puppeteer.use(StealthPlugin());

const KRA_ITAX_URL = 'https://itax.kra.go.ke/KRA-Portal/';
const DEBUG_DIR = path.resolve('./debug' );

if (!fs.existsSync(DEBUG_DIR)) {
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
}

async function launchBrowser() {
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

async function handlePopups(page) {
  try {
    // KRA often shows a "Notice" or "Alert" pop-up that blocks the login field.
    // This script finds any visible "Close" buttons or "X" icons and clicks them.
    await page.evaluate(() => {
      const closeButtons = [
        ...document.querySelectorAll('button'),
        ...document.querySelectorAll('a'),
        ...document.querySelectorAll('span')
      ].filter(el => {
        const text = el.innerText.toLowerCase();
        return text === 'close' || text === 'x' || el.id === 'closeButton';
      });
      closeButtons.forEach(btn => btn.click());
    });
  } catch (e) {
    // No pop-ups found, ignore
  }
}

async function typeIntoField(page, selector, text, description) {
  console.log(`[STEP] Typing into: ${description}`);
  await page.waitForSelector(selector, { visible: true, timeout: 30000 });
  await page.click(selector, { clickCount: 3 });
  await page.type(selector, text, { delay: 50 });
}

async function engineeredClick(page, selector, description) {
  console.log(`[STEP] Clicking: ${description}`);
  await page.waitForSelector(selector, { visible: true, timeout: 30000 });
  await page.click(selector);
}

async function fileNilReturn(kraPin, password) {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log('[STEP] Navigating to KRA portal');
    // Increased timeout to 90 seconds for slow KRA portal
    await page.goto(KRA_ITAX_URL, { waitUntil: 'networkidle2', timeout: 90000 });

    // Handle any blocking pop-ups
    await handlePopups(page);

    // CRITICAL FIX: Try vo.userId first, then fallback to vo.username
    let pinSelector = 'input[name="vo.userId"]';
    try {
      await page.waitForSelector(pinSelector, { visible: true, timeout: 10000 });
    } catch (e) {
      console.log('[INFO] vo.userId not found, trying vo.username');
      pinSelector = 'input[name="vo.username"]';
    }

    await typeIntoField(page, pinSelector, kraPin, 'KRA PIN field');
    await engineeredClick(page, 'a[href="javascript:loginContinue()"]', 'Continue button');

    // Handle session conflict ("Already Logged In")
    try {
      const conflictSelector = 'a[href="javascript:terminateSession(\'Y\')"]';
      await page.waitForSelector(conflictSelector, { visible: true, timeout: 5000 });
      await engineeredClick(page, conflictSelector, 'Terminate session');
    } catch (e) {
      // No conflict detected
    }

    // Wait for password field
    await page.waitForSelector('input[name="vo.password"]', { visible: true, timeout: 30000 });

    // Solve Arithmetic CAPTCHA
    const captchaText = await page.evaluate(() => {
      const label = document.querySelector('label[for="captchatext"]');
      return label ? label.innerText.trim() : null;
    });
    
    if (!captchaText) throw new Error("Could not find CAPTCHA text");
    
    const match = captchaText.match(/(\d+)\s*([\+\-])\s*(\d+)/);
    if (!match) throw new Error(`Unexpected CAPTCHA format: ${captchaText}`);
    
    const num1 = parseInt(match[1]);
    const operator = match[2];
    const num2 = parseInt(match[3]);
    const answer = operator === '+' ? num1 + num2 : num1 - num2;
    
    await typeIntoField(page, 'input[name="captchatext"]', answer.toString(), 'CAPTCHA field');
    await typeIntoField(page, 'input[name="vo.password"]', password, 'Password field');
    await engineeredClick(page, 'a[href="javascript:loginUser()"]', 'Login button');

    // Wait for Dashboard
    await page.waitForSelector('#headerNav', { visible: true, timeout: 40000 });
    console.log('[STEP] Login successful');

    // Navigation to Nil Return
    await engineeredClick(page, 'a[title="Returns"]', 'Returns menu');
    await new Promise(r => setTimeout(r, 1500)); // Wait for menu animation
    await engineeredClick(page, 'a[title="File Nil Return"]', 'File Nil Return');

    // Fill Form
    await page.waitForSelector('select[name="vo.taxObligation"]', { visible: true, timeout: 30000 });
    await page.select('select[name="vo.taxObligation"]', 'Income Tax - Resident Individual');
    await engineeredClick(page, 'a[href="javascript:submitNilReturn()"]', 'Submit button');

    // Confirm
    await engineeredClick(page, 'a[href="javascript:confirmNilReturn()"]', 'Confirm button');
    
    // Get Acknowledgement
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

