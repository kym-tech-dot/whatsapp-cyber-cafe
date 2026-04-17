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

    // 1. Open KRA Portal
    await page.goto('https://itax.kra.go.ke/KRA-Portal/', { waitUntil: 'networkidle2', timeout: 180000 } );

    // 2. AGGRESSIVE POP-UP REMOVAL
    await page.evaluate(() => {
      const closeElements = [...document.querySelectorAll('button, a, span, img')].filter(el => 
        el.innerText?.toLowerCase().includes('close') || el.id?.toLowerCase().includes('close')
      );
      closeElements.forEach(el => el.click());
    });
    await new Promise(r => setTimeout(r, 5000));

    // 3. Enter PIN
    await page.waitForSelector('input#logid', { visible: true, timeout: 60000 });
    await page.type('input#logid', kraPin, { delay: 150 });
    await page.click('a[href*="loginContinue"], #continueBtn');

    // 4. Wait for Password & CAPTCHA
    await page.waitForSelector('input[type="password"]', { visible: true, timeout: 60000 });
    
    // 5. Solve the Math CAPTCHA
    const captchaResult = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('label, span, div, td'));
      const mathLabel = labels.find(l => l.innerText.includes('+') || l.innerText.includes('-'));
      if (!mathLabel) return null;
      const match = mathLabel.innerText.match(/(\d+)\s*([\+\-])\s*(\d+)/);
      return match ? eval(`${match[1]}${match[2]}${match[3]}`) : null;
    });
    
    if (captchaResult === null) throw new Error("KRA Portal slow - CAPTCHA math not found");
    await page.type('input#captcahText', captchaResult.toString(), { delay: 100 });

    // 6. HUMAN-LIKE PASSWORD INJECTION (Bypasses Virtual Keyboard)
    await page.evaluate((pass) => {
      const passField = document.querySelector('input[type="password"]');
      passField.value = pass;
      // Trigger KRA's internal validation so the Login button works
      passField.dispatchEvent(new Event('input', { bubbles: true }));
      passField.dispatchEvent(new Event('change', { bubbles: true }));
      passField.dispatchEvent(new Event('blur', { bubbles: true }));
    }, password);
    
    await new Promise(r => setTimeout(r, 2000));
    await page.click('a#loginButton');

    // 7. Check for Login Errors (Invalid PIN/Password)
    const loginError = await page.evaluate(() => {
      const errorBox = document.querySelector('.error, .errorMessage, #errors');
      return errorBox ? errorBox.innerText.trim() : null;
    });
    if (loginError) throw new Error(`KRA Login Error: ${loginError}`);

    // 8. Dashboard & Filing (Wait up to 3 mins)
    await page.waitForSelector('#headerNav', { visible: true, timeout: 180000 });
    await page.click('a[title="Returns"]');
    await new Promise(r => setTimeout(r, 2000));
    await page.click('a[title="File Nil Return"]');
    
    await page.waitForSelector('select[name="vo.taxObligation"]', { visible: true });
    await page.select('select[name="vo.taxObligation"]', 'Income Tax - Resident Individual');
    await page.click('a[href*="submitNilReturn"]');
    
    await page.waitForSelector('a[href*="confirmNilReturn"]', { visible: true });
    await page.click('a[href*="confirmNilReturn"]');
    
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

