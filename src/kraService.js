'use strict';
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function fileNilReturn(kraPin, password) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage', 
        '--disable-gpu',
        '--window-size=1366,768'
      ]
    });
    const page = await browser.newPage();
    // Use a very common User Agent to blend in
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    // 1. Open KRA Portal
    await page.goto('https://itax.kra.go.ke/KRA-Portal/', { waitUntil: 'networkidle2', timeout: 180000 } );

    // 2. AGGRESSIVE POP-UP REMOVAL
    await page.evaluate(() => {
      const closeElements = [...document.querySelectorAll('button, a, span, img, div')].filter(el => 
        el.innerText?.toLowerCase().includes('close') || 
        el.id?.toLowerCase().includes('close') ||
        el.innerText === 'X'
      );
      closeElements.forEach(el => el.click());
    });
    await new Promise(r => setTimeout(r, 5000));

    // 3. Enter PIN
    // We look for ANY input field that looks like a PIN field
    const pinField = await page.waitForSelector('input#logid, input[name="logid"], input[name*="userId"]', { visible: true, timeout: 60000 });
    await pinField.type(kraPin, { delay: 150 });
    
    // 4. UNIVERSAL CONTINUE CLICK (No IDs needed)
    await page.evaluate(() => {
      // Find any clickable element that contains the word "Continue"
      const elements = [...document.querySelectorAll('a, button, input[type="button"], span')];
      const continueBtn = elements.find(el => el.innerText?.toLowerCase().includes('continue') || el.value?.toLowerCase().includes('continue'));
      
      if (continueBtn) {
        continueBtn.scrollIntoView();
        continueBtn.click();
      } else {
        // Fallback: Try the known javascript link if text search fails
        const jsLink = document.querySelector('a[href*="loginContinue"]');
        if (jsLink) jsLink.click();
        else throw new Error("Could not find any 'Continue' button or link on the page.");
      }
    });

    // 5. Wait for Password & CAPTCHA
    await page.waitForSelector('input[type="password"]', { visible: true, timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000));

    // 6. Solve the Math CAPTCHA
    const captchaResult = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('label, span, div, td'));
      const mathLabel = labels.find(l => l.innerText.includes('+') || l.innerText.includes('-'));
      if (!mathLabel) return null;
      const match = mathLabel.innerText.match(/(\d+)\s*([\+\-])\s*(\d+)/);
      return match ? eval(`${match[1]}${match[2]}${match[3]}`) : null;
    });
    
    if (captchaResult === null) throw new Error("KRA Portal slow - CAPTCHA math not found");
    await page.type('input#captcahText', captchaResult.toString(), { delay: 100 });

    // 7. Enter Password (Human-Like Injection)
    await page.evaluate((pass) => {
      const passField = document.querySelector('input[type="password"]');
      passField.value = pass;
      passField.dispatchEvent(new Event('input', { bubbles: true }));
      passField.dispatchEvent(new Event('change', { bubbles: true }));
    }, password);
    
    await new Promise(r => setTimeout(r, 2000));
    await page.click('a#loginButton');

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

