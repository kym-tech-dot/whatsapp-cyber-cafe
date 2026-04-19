// Improved version of kraService.js to handle password field timeout issues.

const puppeteer = require('puppeteer');

async function launchBrowser() {
    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    return browser;
}

async function waitForElementVisible(page, selector, timeout = 90000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        const element = await page.$(selector);
        if (element) {
            const isVisible = await element.isIntersectingViewport();
            if (isVisible) {
                return element;
            }
        }
        await page.waitForTimeout(1000);
    }
    throw new Error(`Element ${selector} not visible after ${timeout} ms`);
}

async function handleCaptcha(page) {
    // Enhanced CAPTCHA handling logic here
    // ...
}

async function fillPinField(page, pin) {
    const pinField = await waitForElementVisible(page, 'input[name="pin"]', 90000);
    await pinField.click();
    await page.evaluate((field) => field.value = '', pinField);
    await pinField.type(pin);
}

async function fillPasswordField(page, password) {
    const passwordField = await waitForElementVisible(page, 'input[name="password"]', 90000);
    await passwordField.click();
    await page.evaluate((field) => field.value = '', passwordField);
    await passwordField.type(password);
}

async function takeScreenshot(page, filename) {
    await page.screenshot({ path: filename });
}

(async () => {
    const browser = await launchBrowser();
    const page = await browser.newPage();

    try {
        // Navigate to the login page
        await page.goto('https://example.com/login');

        // Handle CAPTCHA if it appears
        await handleCaptcha(page);

        // Fill in the PIN and password
        await fillPinField(page, '1234');
        await fillPasswordField(page, 'your-password');

        // Take debug screenshot
        await takeScreenshot(page, 'debug_screenshot.png');
    } catch (error) {
        console.error('An error occurred:', error);
    } finally {
        await browser.close();
    }
})();
