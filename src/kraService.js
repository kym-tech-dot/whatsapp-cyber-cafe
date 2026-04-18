'use strict';
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function fileNilReturn(job, onProgress) {
  const { kraPin, password } = job;
  let browser;
  const log = (msg) => {
    console.log(`[KRA-LOG]: ${msg}`);
    if (onProgress) onProgress(msg);
  };

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--blink-settings=imagesEnabled=false' // RAM Optimization
      ]
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    log("Inafungua KRA iTax...");
    await page.goto('https://itax.kra.go.ke/KRA-Portal/', { waitUntil: 'networkidle2', timeout: 90000 } );

    // Funga pop-ups
    await page.evaluate(() => {
      const closeBtns = [...document.querySelectorAll('button, a, span')].filter(el => 
        ['close', 'x'].includes(el.innerText?.toLowerCase().trim())
      );
      closeBtns.forEach(btn => btn.click());
    });
    await new Promise(r => setTimeout(r, 2000));

    log("Inaingiza PIN...");
    await page.waitForSelector('input#logid', { visible: true, timeout: 30000 });
    await page.type('input#logid', kraPin, { delay: 50 });
    
    log("Inabofya Continue...");
    await page.evaluate(() => {
      const btn = document.querySelector('a#continueBtn') || document.querySelector('button#continueBtn');
      if (btn) btn.click();
    });

    // Handle "User is already logged in" or other alerts that close the session
    try {
      await Promise.race([
        page.waitForSelector('input[type="password"]', { visible: true, timeout: 30000 }),
        page.waitForSelector('.error, .errorMessage, #errors', { visible: true, timeout: 30000 })
      ]);
    } catch (e) {
      // If both fail, it might be a target closed error
      throw new Error("KRA Portal haijaitikia kwa wakati au imefunga session.");
    }

    const loginError = await page.evaluate(() => {
      const errorBox = document.querySelector('.error, .errorMessage, #errors');
      return errorBox ? errorBox.innerText.trim() : null;
    });
    if (loginError) throw new Error(`KRA Portal Error: ${loginError}`);

    log("Inasubiri Password...");
    
    log("Inatatua CAPTCHA...");
    const captchaResult = await page.evaluate(() => {
      const mathLabel = [...document.querySelectorAll('label, span, td')].find(l => l.innerText.includes('+') || l.innerText.includes('-'));
      if (!mathLabel) return null;
      const match = mathLabel.innerText.match(/(\d+)\s*([\+\-])\s*(\d+)/);
      return match ? eval(`${match[1]}${match[2]}${match[3]}`) : null;
    });
    
    if (captchaResult === null) throw new Error("CAPTCHA haijapatikana");
    await page.type('input#captcahText', captchaResult.toString());

    log("Inaingiza Password...");
    await page.evaluate((pass) => {
      const f = document.querySelector('input[type="password"]');
      if (f) {
        f.value = pass;
        f.dispatchEvent(new Event('input', { bubbles: true }));
        f.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, password);
    
    await new Promise(r => setTimeout(r, 1000));
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
      page.click('a#loginButton')
    ]);

    log("Inasubiri Dashboard...");
    try {
      await page.waitForSelector('#headerNav', { visible: true, timeout: 60000 });
    } catch (e) {
      // Check for login errors again if dashboard didn't load
      const postLoginError = await page.evaluate(() => {
        const errorBox = document.querySelector('.error, .errorMessage, #errors');
        return errorBox ? errorBox.innerText.trim() : null;
      });
      if (postLoginError) throw new Error(`Login Error: ${postLoginError}`);
      throw new Error("Imeshindwa kufungua Dashboard baada ya login.");
    }
    
    log("Inafanya Nil Return...");
    await page.click('a[title="Returns"]');
    await new Promise(r => setTimeout(r, 1000));
    await page.click('a[title="File Nil Return"]');
    
    await page.waitForSelector('select[name="vo.taxObligation"]', { visible: true });
    await page.select('select[name="vo.taxObligation"]', 'Income Tax - Resident Individual');
    await page.click('a[href*="submitNilReturn"]');
    
    await page.waitForSelector('a[href*="confirmNilReturn"]', { visible: true });
    await page.click('a[href*="confirmNilReturn"]');
    
    const ack = await page.waitForSelector('#acknowledgementNo', { visible: true, timeout: 30000 });
    const ackText = await page.evaluate(el => el.innerText, ack);
    
    return { success: true, acknowledgementNumber: ackText.trim() };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    if (browser) await browser.close();
  }
}
module.exports = { fileNilReturn };
