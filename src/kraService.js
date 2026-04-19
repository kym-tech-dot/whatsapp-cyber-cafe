// Improved version of kraService.js

const { expect } = require('chai');
const { Builder, By, until } = require('selenium-webdriver');

class KraService {
    constructor() {
        this.driver = new Builder().forBrowser('chrome').build();
    }

    async navigateToPage(url) {
        try {
            await this.driver.get(url);
            console.log(`Navigated to ${url}`);
        } catch (error) {
            console.error(`Error navigating to page: ${error.message}`);
            await this.takeScreenshot();
        }
    }

    async waitForElement(selector, timeout = 90000) {
        try {
            const element = await this.driver.wait(until.elementLocated(By.css(selector)), timeout);
            await this.driver.wait(until.elementIsVisible(element), timeout);
            return element;
        } catch (error) {
            console.error(`Element not found: ${selector}. Error: ${error.message}`);
            await this.takeScreenshot();
            await this.reloadPageIfNeeded();
        }
    }

    async enterPassword(password) {
        const passwordFieldSelector = 'input[type="password"]';
        const passwordField = await this.waitForElement(passwordFieldSelector);
        if (passwordField) {
            await passwordField.sendKeys(password);
            console.log('Password entered successfully.');
        } else {
            console.error('Password field not found!');
        }
    }

    async takeScreenshot() {
        const filePath = `screenshots/error_${Date.now()}.png`;
        await this.driver.takeScreenshot().then((image) => {
            require('fs').writeFileSync(filePath, image, 'base64');
            console.log(`Screenshot saved to ${filePath}`);
        });
    }

    async reloadPageIfNeeded() {
        const passwordFieldSelector = 'input[type="password"]';
        const element = await this.driver.findElements(By.css(passwordFieldSelector));
        if (element.length === 0) {
            console.log('Reloading page due to password field not found.');
            await this.driver.navigate().refresh();
        }
    }

    async close() {
        await this.driver.quit();
    }
}

module.exports = KraService;