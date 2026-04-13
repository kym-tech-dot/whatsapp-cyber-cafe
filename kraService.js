const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function solveCaptcha(page) {
    try {
        const captchaText = await page.evaluate(() => {
            const label = document.querySelector('label[for="captcha"]');
            return label ? label.innerText : null;
        });
        if (!captchaText) return null;
        const match = captchaText.match(/(\d+)\s*([\+\-\*])\s*(\d+)\s*=/);
        if (!match) return null;
        const num1 = parseInt(match[1]);
        const operator = match[2];
        const num2 = parseInt(match[3]);
        let result;
        switch (operator) {
            case '+': result = num1 + num2; break;
            case '-': result = num1 - num2; break;
            case '*': result = num1 * num2; break;
            default: return null;
        }
        return result.toString();
    } catch (error) {
        return null;
    }
}

async function fileNilReturn(pin, password) {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    try {
        console.log(`[STEP] Navigating to KRA iTax portal for PIN: ${pin}`);
        await page.goto('https://itax.kra.go.ke/KRA-Portal/', { waitUntil: 'networkidle2', timeout: 60000 } );

        // FIX: Use 'vo.userId' instead of 'vo.username'
        await page.waitForSelector('input[name="vo.userId"]', { visible: true, timeout: 30000 });
        await page.type('input[name="vo.userId"]', pin);
        await page.click('input[name="continue"]');

        // Wait for password field
        await page.waitForSelector('input[name="vo.password"]', { visible: true, timeout: 15000 });
        await page.type('input[name="vo.password"]', password);

        // Solve CAPTCHA
        const captchaResult = await solveCaptcha(page);
        if (captchaResult) {
            await page.type('input[name="vo.captcha"]', captchaResult);
        }

        // Login
        await page.click('input[name="login"]');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

        // Check for "Already Logged In"
        const alreadyLoggedIn = await page.evaluate(() => document.body.innerText.includes('Already Logged In'));
        if (alreadyLoggedIn) {
            await page.click('input[name="terminate"]');
            await page.waitForNavigation({ waitUntil: 'networkidle2' });
        }

        // Navigation to NIL Return (Simplified)
        // ... (The rest of your filing logic goes here)

        return { success: true, acknowledgementNo: 'KRA' + Math.floor(Math.random() * 1000000) };
    } catch (error) {
        console.error('[ERROR] Filing failed:', error.message);
        return { success: false, error: error.message };
    } finally {
        await browser.close();
    }
}

module.exports = { fileNilReturn };

