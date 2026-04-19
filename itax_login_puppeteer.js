const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({
        headless: false, // Set to true if you don't want to see the browser
        args: ['--start-maximized']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    // Configuration
    const KRA_PIN = 'A012345678Z'; // Replace with actual PIN
    const KRA_PASSWORD = 'YourPasswordHere'; // Replace with actual Password

    try {
        console.log('Navigating to KRA iTax Portal...');
        await page.goto('https://itax.kra.go.ke/KRA-Portal/', { waitUntil: 'networkidle2' });

        // 1. Enter PIN
        console.log('Entering PIN...');
        await page.waitForSelector('#logid');
        await page.type('#logid', KRA_PIN);
        
        // Click Continue
        await page.click('#pinradio'); // Ensure PIN radio is selected
        await page.click('a#Continue');

        // 2. Wait for Password field
        console.log('Waiting for password field to appear...');
        await page.waitForSelector('input[type="password"]', { timeout: 30000 });

        // 3. FIX: Clear the password field thoroughly
        // This handles the issue where the password field is pre-filled
        console.log('Clearing pre-filled password field...');
        await page.focus('input[type="password"]');
        
        // Select all text and delete
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyA');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');

        // 4. Enter Password
        console.log('Entering password...');
        await page.type('input[type="password"]', KRA_PASSWORD, { delay: 100 });

        // 5. Handle Captcha
        console.log('Please solve the arithmetic captcha manually on the browser screen.');
        
        // The script stays open for 2 minutes to allow you to solve captcha and login
        console.log('Waiting for manual login completion...');
        await new Promise(resolve => setTimeout(resolve, 120000));

    } catch (error) {
        console.error('An error occurred:', error.message);
    } finally {
        // Uncomment the line below if you want the browser to close automatically
        // await browser.close();
    }
})();
