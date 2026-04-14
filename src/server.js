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

    // 1. Navigate to KRA
    console.log('[V21] Navigating to KRA...');
    await page.goto('https://itax.kra.go.ke/KRA-Portal/', { waitUntil: 'networkidle2', timeout: 180000 } );

    // 2. AGGRESSIVE POP-UP KILLER
    await page.evaluate(() => {
      const selectors = ['button', 'a', 'span', 'div'];
      selectors.forEach(sel => {
        const elements = Array.from(document.querySelectorAll(sel));
        elements.forEach(el => {
          const text = el.innerText.toLowerCase();
          if (text === 'x' || text.includes('close') || text.includes('dismiss') || text.includes('ignore')) {
            el.click();
          }
        });
      });
    });
    await new Promise(r => setTimeout(r, 2000)); // Wait for pop-ups to fade

    // 3. Enter PIN
    console.log('[V21] Entering PIN...');
    const pinField = await page.waitForSelector('input#logid, input[name="logid"]', { visible: true, timeout: 60000 });
    await pinField.type(kraPin, { delay: 100 });
    
    // 4. SMART CONTINUE CLICK
    console.log('[V21] Clicking Continue...');
    await page.evaluate(() => {
      // Try finding by ID first
      const btnById = document.getElementById('continueBtn');
      if (btnById) return btnById.click();
      
      // Try finding by the javascript link
      const btnByHref = document.querySelector('a[href*="loginContinue"]');
      if (btnByHref) return btnByHref.click();
      
      // Try finding by text
      const btnByText = Array.from(document.querySelectorAll('a, button')).find(el => el.innerText.toLowerCase().includes('continue'));
      if (btnByText) return btnByText.click();
      
      throw new Error("Continue button not found on page");
    });

    // 5. Wait for Password & CAPTCHA
    console.log('[V21] Waiting for Password/CAPTCHA...');
    await page.waitForSelector('input[type="password"]', { visible: true, timeout: 60000 });
    
    const captcha = await page.evaluate(() => {
      const label = Array.from(document.querySelectorAll('label')).find(l => l.innerText.includes('+') || l.innerText.includes('-'));
      if (!label) return null;
      const match = label.innerText.match(/(\d+)\s*([\+\-])\s*(\d+)/);
      return match ? eval(`${match[1]}${match[2]}${match[3]}`) : null;
    });
    
    if (!captcha) throw new Error("KRA Portal slow - CAPTCHA not found");
    await page.type('input#captcahText', captcha.toString());

    // 6. Human-Like Password Injection
    await page.evaluate((pass) => {
      const passField = document.querySelector('input[type="password"]');
      passField.value = pass;
      passField.dispatchEvent(new Event('input', { bubbles: true }));
      passField.dispatchEvent(new Event('blur', { bubbles: true }));
    }, password);
    
    await new Promise(r => setTimeout(r, 1000));
    await page.click('a#loginButton');

    // 7. Dashboard & Filing
    console.log('[V21] Navigating Dashboard...');
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
