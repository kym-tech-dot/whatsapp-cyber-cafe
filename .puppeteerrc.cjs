const {join} = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Changes the cache location for Puppeteer to a consistent, predictable directory.
  // This is crucial for Render deployments to avoid "Browser not found" errors
  // after a version update.
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
