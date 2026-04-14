'use strict';
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function fileNilReturn(kraPin, password) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    // 1. Navigate
    await page.goto('https://itax.kra.go.ke/KRA-Portal/', { waitUntil: 'networkidle2', timeout: 120000 } );

    // 2. PIN
    await page.waitForSelector('input#logid', { visible: true, timeout: 60000 });
    await page.type('input#logid', kraPin, { delay: 100 });
    await page.click('a[href="javascript:loginContinue()"]');

    // 3. Password & CAPTCHA
    await page.waitForSelector('input[type="password"]', { visible: true, timeout: 60000 });
    const captcha = await page.evaluate(() => {
      const label = Array.from(document.querySelectorAll('label')).find(l => l.innerText.includes('+') || l.innerText.includes('-'));
      if (!label) return null;
      const match = label.innerText.match(/(\d+)\s*([\+\-])\s*(\d+)/);
      return match ? eval(`${match[1]}${match[2]}${match[3]}`) : null;
    });
    if (!captcha) throw new Error("KRA Portal slow - CAPTCHA not found");
    await page.type('input#captcahText', captcha.toString());

    // 4. HUMAN INJECTION (Bypasses Virtual Keyboard)
    await page.evaluate((pass) => {
      const passField = document.querySelector('input[type="password"]');
      passField.value = pass;
      passField.dispatchEvent(new Event('input', { bubbles: true }));
      passField.dispatchEvent(new Event('blur', { bubbles: true }));
    }, password);
    await new Promise(r => setTimeout(r, 1000));
    await page.click('a#loginButton');

    // 5. Filing
    await page.waitForSelector('#headerNav', { visible: true, timeout: 90000 });
    await page.click('a[title="Returns"]');
    await new Promise(r => setTimeout(r, 2000));
    await page.click('a[title="File Nil Return"]');
    await page.waitForSelector('select[name="vo.taxObligation"]', { visible: true });
    await page.select('select[name="vo.taxObligation"]', 'Income Tax - Resident Individual');
    await page.click('a[href="javascript:submitNilReturn()"]');
    await page.waitForSelector('a[href="javascript:confirmNilReturn()"]', { visible: true });
    await page.click('a[href="javascript:confirmNilReturn()"]');
    
    const ackNo = await page.waitForSelector('#acknowledgementNo', { visible: true, timeout: 60000 });
    const text = await page.evaluate(el => el.innerText, ackNo);
    return { success: true, acknowledgementNo: text.trim() };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    if (browser) await browser.close();
  }
}
module.exports = { fileNilReturn };

