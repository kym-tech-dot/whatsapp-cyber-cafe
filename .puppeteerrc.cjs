const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // This tells Puppeteer to save Chrome inside your project folder so Render can find it
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};


