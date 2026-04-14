'use strict';

/**
 * kraService.js
 *
 * Core Puppeteer automation module for KRA iTax NIL return filing.
 * Encapsulates all browser interaction logic with robust utilities
 * designed to handle KRA's slow, dynamic, and JavaScript-heavy portal.
 *
 * Design principles:
 *  - All selectors prefer stable attributes (id, href, title) over class names.
 *  - Every click goes through `engineeredClick` for reliability.
 *  - Failures capture a screenshot + full HTML for post-mortem debugging.
 *  - The module exports a single async function: `fileNilReturn(job)`.
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

// Apply stealth plugin to avoid bot detection on KRA portal
puppeteer.use(StealthPlugin());

// ─── Constants ────────────────────────────────────────────────────────────────

const KRA_ITAX_URL = 'https://itax.kra.go.ke/KRA-Portal/';
const DEBUG_DIR = path.resolve(process.env.DEBUG_DIR || './debug');
const NETWORK_IDLE_TIMEOUT = 30_000; // 30 s — KRA pages can be very slow
const SELECTOR_TIMEOUT = 30_000;     // 30 s — wait for elements to appear
const SLOW_MO = parseInt(process.env.PUPPETEER_SLOW_MO || '50', 10);
const MAX_CLICK_RETRIES = 3;

// Ensure the debug output directory exists
if (!fs.existsSync(DEBUG_DIR)) {
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
}

// ─── Browser Launch ───────────────────────────────────────────────────────────

/**
 * Launches a Puppeteer browser instance configured for cloud and stealth use.
 *
 * headless: 'new' is the modern Chromium headless mode that behaves more like
 * a real browser and is required for puppeteer-extra-plugin-stealth to work
 * correctly. Set PUPPETEER_HEADLESS=false in .env to watch the browser.
 */
async function launchBrowser() {
  const headless = process.env.PUPPETEER_HEADLESS !== 'false';

  logger.step('Launching browser');

  const browser = await puppeteer.launch({
    headless: headless ? 'new' : false,
    slowMo: SLOW_MO,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',     // Prevents /dev/shm exhaustion on Render
      '--disable-gpu',
      '--window-size=1366,768',
      '--disable-blink-features=AutomationControlled',
    ],
    defaultViewport: { width: 1366, height: 768 },
  });

  // Override navigator.webdriver on every new page to further reduce detection
  browser.on('targetcreated', async (target) => {
    const page = await target.page();
    if (page) {
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      });
    }
  });

  return browser;
}

// ─── Core Interaction Utilities ───────────────────────────────────────────────

/**
 * Waits for the network to reach an idle state.
 * Uses a polling approach compatible with Puppeteer (not Playwright).
 * Falls back gracefully if the timeout is exceeded — KRA pages sometimes
 * never fully "idle" due to analytics or polling scripts.
 *
 * @param {import('puppeteer').Page} page
 * @param {number} [timeout=NETWORK_IDLE_TIMEOUT]
 */
async function waitForNetworkIdle(page, timeout = NETWORK_IDLE_TIMEOUT) {
  try {
    await page.waitForNetworkIdle({ idleTime: 500, timeout });
  } catch {
    // Non-fatal: log and continue — the page may still be usable
    logger.warn('Network did not fully idle within timeout — continuing anyway');
  }
}

/**
 * engineeredClick — the primary interaction utility.
 *
 * Performs a reliable, multi-stage click on a DOM element:
 *  1. Wait for the selector to be visible.
 *  2. Wait for the network to settle.
 *  3. Scroll the element into the viewport.
 *  4. Attempt a native Puppeteer click up to MAX_CLICK_RETRIES times.
 *  5. If all retries fail, fall back to a JavaScript-injected click.
 *
 * This approach eliminates the "Node is either not clickable or not an Element"
 * error by ensuring the element is visible, in-viewport, and attached to the
 * DOM before every click attempt.
 *
 * @param {import('puppeteer').Page} page
 * @param {string} selector  - CSS selector (prefer id/href/title over class)
 * @param {object} [options]
 * @param {number} [options.timeout]       - Override selector wait timeout
 * @param {boolean} [options.skipIdle]     - Skip network-idle wait (fast clicks)
 * @param {string} [options.description]   - Human-readable label for logging
 */
async function engineeredClick(page, selector, options = {}) {
  const {
    timeout = SELECTOR_TIMEOUT,
    skipIdle = false,
    description = selector,
  } = options;

  logger.step(`Clicking: ${description}`);

  // ── Stage 1: Wait for the element to be visible ──────────────────────────
  let elementHandle;
  try {
    elementHandle = await page.waitForSelector(selector, {
      visible: true,
      timeout,
    });
  } catch (err) {
    throw new Error(
      `[engineeredClick] Element not visible after ${timeout}ms: "${description}" (${selector})\n${err.message}`
    );
  }

  // ── Stage 2: Wait for network to settle ──────────────────────────────────
  if (!skipIdle) {
    await waitForNetworkIdle(page);
  }

  // ── Stage 3: Scroll element into view ────────────────────────────────────
  try {
    await elementHandle.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  } catch {
    // Element may have detached during scroll — re-query below
  }

  // ── Stage 4: Retry native click ──────────────────────────────────────────
  for (let attempt = 1; attempt <= MAX_CLICK_RETRIES; attempt++) {
    try {
      // Re-query on every attempt to handle detached elements
      const el = await page.$(selector);
      if (!el) throw new Error('Element detached from DOM');

      await el.click();
      logger.step(`Clicked (attempt ${attempt}): ${description}`);
      return; // Success — exit early
    } catch (err) {
      logger.warn(`Click attempt ${attempt}/${MAX_CLICK_RETRIES} failed for "${description}": ${err.message}`);
      if (attempt < MAX_CLICK_RETRIES) {
        await delay(500 * attempt); // Exponential back-off
      }
    }
  }

  // ── Stage 5: JavaScript fallback click ───────────────────────────────────
  logger.warn(`Falling back to JavaScript click for: ${description}`);
  try {
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`JS click: element not found for selector "${sel}"`);
      el.click();
    }, selector);
    logger.step(`JavaScript click succeeded: ${description}`);
  } catch (err) {
    throw new Error(
      `[engineeredClick] All click strategies failed for "${description}" (${selector})\n${err.message}`
    );
  }
}

/**
 * Types text into an input field after clearing any existing value.
 * Waits for the field to be visible before typing.
 *
 * @param {import('puppeteer').Page} page
 * @param {string} selector
 * @param {string} text
 * @param {string} [description]
 */
async function typeIntoField(page, selector, text, description = selector) {
  logger.step(`Typing into: ${description}`);

  await page.waitForSelector(selector, { visible: true, timeout: SELECTOR_TIMEOUT });

  // Clear the field first (triple-click selects all, then type replaces)
  await page.click(selector, { clickCount: 3 });
  await page.type(selector, text, { delay: 40 }); // Humanised typing speed
}

/**
 * Simple promise-based delay.
 * @param {number} ms
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Debugging Utilities ──────────────────────────────────────────────────────

/**
 * Captures a screenshot and the full page HTML to the debug directory.
 * Called automatically on any step failure.
 *
 * @param {import('puppeteer').Page} page
 * @param {string} label  - Descriptive label for the artefact filenames
 */
async function captureDebugArtifacts(page, label) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeLabel = label.replace(/\s+/g, '_').toLowerCase();
  const screenshotPath = path.join(DEBUG_DIR, `${timestamp}_${safeLabel}.png`);
  const htmlPath = path.join(DEBUG_DIR, `${timestamp}_${safeLabel}.html`);

  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
    logger.info(`Screenshot saved: ${screenshotPath}`);
  } catch (e) {
    logger.error(`Failed to capture screenshot: ${e.message}`);
  }

  try {
    const html = await page.content();
    fs.writeFileSync(htmlPath, html, 'utf8');
    logger.info(`HTML dump saved: ${htmlPath}`);
  } catch (e) {
    logger.error(`Failed to save HTML dump: ${e.message}`);
  }

  return { screenshotPath, htmlPath };
}

// ─── KRA iTax Automation Steps ────────────────────────────────────────────────

/**
 * Navigates to the KRA iTax portal and waits for the login page to load.
 *
 * @param {import('puppeteer').Page} page
 */
async function navigateToPortal(page) {
  logger.step('Navigating to KRA iTax portal');
  await page.goto(KRA_ITAX_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await waitForNetworkIdle(page);
  logger.step('Portal loaded');
}

/**
 * Performs the two-step login process on KRA iTax:
 *  1. Enter KRA PIN → click Continue.
 *  2. Wait for the password field to appear (it is rendered dynamically).
 *  3. Enter password → click Login.
 *
 * Selector strategy: prefer `id` and `name` attributes over class names
 * because KRA's CSS classes change with portal updates.
 *
 * @param {import('puppeteer').Page} page
 * @param {string} kraPin
 * @param {string} password
 */
async function login(page, kraPin, password) {
  logger.step('Starting login sequence');

  // ── Step 1: Enter KRA PIN ─────────────────────────────────────────────────
  await typeIntoField(page, 'input[name="vo.userId"]', kraPin, 'KRA PIN field');

  // ── Step 2: Click "Continue" ──────────────────────────────────────────────
  // KRA uses a JavaScript href button — must use engineeredClick
  await engineeredClick(
    page,
    'a[href="javascript:loginContinue()"]',
    { description: 'Continue button' }
  );

  // ── Step 3: Handle "Already Logged In" session conflict ──────────────────
  // Sometimes KRA shows a "You are already logged in" message.
  // We check for this and click "Yes" to terminate the other session.
  try {
    const sessionConflictSelector = 'a[href="javascript:terminateSession(\'Y\')"]';
    const conflictFound = await page.waitForSelector(sessionConflictSelector, {
      visible: true,
      timeout: 5000,
    });
    if (conflictFound) {
      logger.warn('Session conflict detected — terminating previous session');
      await engineeredClick(page, sessionConflictSelector, { description: 'Terminate session button' });
      await waitForNetworkIdle(page);
    }
  } catch {
    // No conflict detected, proceed normally
  }

  // ── Step 4: Wait for password field (dynamically injected after Continue) ─
  logger.step('Waiting for password field to appear');
  try {
    await page.waitForSelector('input[name="vo.password"]', {
      visible: true,
      timeout: 20_000,
    });
  } catch {
    throw new Error(
      'Password field did not appear after clicking Continue. ' +
      'The KRA PIN may be invalid or the portal is unresponsive.'
    );
  }

  // ── Step 5: Solve Security Stamp (Arithmetic CAPTCHA) ─────────────────────
  logger.step('Solving security stamp (CAPTCHA)');
  try {
    const captchaText = await page.evaluate(() => {
      const label = document.querySelector('label[for="captchatext"]');
      return label ? label.innerText.trim() : null;
    });

    if (!captchaText) throw new Error('CAPTCHA text not found');

    // KRA CAPTCHA is usually "5 + 2 =" or "10 - 3 ="
    const match = captchaText.match(/(\d+)\s*([\+\-])\s*(\d+)/);
    if (!match) throw new Error(`Unexpected CAPTCHA format: ${captchaText}`);

    const num1 = parseInt(match[1], 10);
    const operator = match[2];
    const num2 = parseInt(match[3], 10);
    const answer = operator === '+' ? num1 + num2 : num1 - num2;

    logger.info(`CAPTCHA solved: ${captchaText} ${answer}`);
    await typeIntoField(page, 'input[name="captchatext"]', answer.toString(), 'CAPTCHA field');
  } catch (err) {
    throw new Error(`Failed to solve security stamp: ${err.message}`);
  }

  // ── Step 6: Enter password ────────────────────────────────────────────────
  await typeIntoField(page, 'input[name="vo.password"]', password, 'Password field');

  // ── Step 7: Click "Login" ─────────────────────────────────────────────────
  await engineeredClick(
    page,
    'a[href="javascript:loginUser()"]',
    { description: 'Login button' }
  );

  await waitForNetworkIdle(page);
  logger.step('Login submitted — waiting for dashboard');

  // ── Step 6: Verify login success ──────────────────────────────────────────
  // KRA redirects to the taxpayer dashboard on success; on failure it stays
  // on the login page and shows an error message.
  try {
    await page.waitForSelector('#headerNav', { visible: true, timeout: 20_000 });
    logger.step('Login successful — dashboard loaded');
  } catch {
    // Check for an error message on the login page
    const errorText = await page.evaluate(() => {
      const el = document.querySelector('.error, #errorMsg, [class*="error"]');
      return el ? el.innerText.trim() : null;
    });
    throw new Error(
      errorText
        ? `Login failed: ${errorText}`
        : 'Login failed: Dashboard did not load after login. Check credentials.'
    );
  }
}

/**
 * Navigates to the NIL return filing section from the dashboard.
 *
 * The KRA portal uses a multi-level navigation menu. We navigate via:
 *  Returns → File Nil Return
 *
 * @param {import('puppeteer').Page} page
 */
async function navigateToNilReturn(page) {
  logger.step('Navigating to NIL return section');

  // ── Open "Returns" menu ───────────────────────────────────────────────────
  await engineeredClick(
    page,
    'a[title="Returns"]',
    { description: 'Returns menu' }
  );
  await delay(800); // Allow sub-menu to render

  // ── Click "File Nil Return" ───────────────────────────────────────────────
  await engineeredClick(
    page,
    'a[title="File Nil Return"]',
    { description: 'File Nil Return menu item' }
  );

  await waitForNetworkIdle(page);
  logger.step('NIL return form page loaded');
}

/**
 * Fills in and submits the NIL return form.
 *
 * The form requires:
 *  - Tax obligation selection (Income Tax - Resident Individual)
 *  - Return period (year)
 *
 * @param {import('puppeteer').Page} page
 */
async function submitNilReturnForm(page) {
  logger.step('Filling NIL return form');

  // ── Select tax obligation ─────────────────────────────────────────────────
  await page.waitForSelector('select[name="vo.taxObligation"]', {
    visible: true,
    timeout: SELECTOR_TIMEOUT,
  });
  await page.select('select[name="vo.taxObligation"]', 'Income Tax - Resident Individual');
  logger.step('Tax obligation selected');
  await delay(500);

  // ── Click Submit ──────────────────────────────────────────────────────────
  await engineeredClick(
    page,
    'a[href="javascript:submitNilReturn()"]',
    { description: 'Submit NIL return button' }
  );

  await waitForNetworkIdle(page);
  logger.step('NIL return form submitted');
}

/**
 * Confirms the NIL return on the confirmation/acknowledgement page.
 *
 * @param {import('puppeteer').Page} page
 */
async function confirmNilReturn(page) {
  logger.step('Confirming NIL return submission');

  // ── Click the final confirmation button ───────────────────────────────────
  await engineeredClick(
    page,
    'a[href="javascript:confirmNilReturn()"]',
    { description: 'Confirm NIL return button' }
  );

  await waitForNetworkIdle(page);

  // ── Capture acknowledgement number ────────────────────────────────────────
  let acknowledgementNumber = null;
  try {
    await page.waitForSelector('#acknowledgementNo, [id*="acknowledgement"]', {
      visible: true,
      timeout: 15_000,
    });
    acknowledgementNumber = await page.evaluate(() => {
      const el = document.querySelector('#acknowledgementNo, [id*="acknowledgement"]');
      return el ? el.innerText.trim() : null;
    });
  } catch {
    // Acknowledgement element not found — try to extract from page text
    acknowledgementNumber = await page.evaluate(() => {
      const match = document.body.innerText.match(/Acknowledgement\s*(?:No\.?|Number)?\s*[:\-]?\s*([A-Z0-9\-]+)/i);
      return match ? match[1] : null;
    });
  }

  if (acknowledgementNumber) {
    logger.step(`NIL return confirmed. Acknowledgement: ${acknowledgementNumber}`);
  } else {
    logger.warn('NIL return confirmed but acknowledgement number could not be extracted');
  }

  return acknowledgementNumber;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * fileNilReturn — the single public function of this module.
 *
 * Orchestrates the full NIL return filing workflow for one user job.
 * Handles browser lifecycle, error capture, and cleanup.
 *
 * @param {object} job
 * @param {string} job.userId      - Telegram user ID (for log correlation)
 * @param {string} job.kraPin      - KRA PIN (e.g. A001234567P)
 * @param {string} job.password    - iTax password
 *
 * @returns {Promise<{success: boolean, acknowledgementNumber?: string, error?: string, artifacts?: object}>}
 */
async function fileNilReturn(job) {
  const { userId, kraPin, password } = job;
  const jobLabel = `user_${userId}_${kraPin}`;

  logger.step(`[Job ${jobLabel}] Starting NIL return filing`);

  let browser = null;
  let page = null;

  try {
    browser = await launchBrowser();
    page = await browser.newPage();

    // Set a realistic user-agent to reduce bot fingerprinting
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/120.0.0.0 Safari/537.36'
    );

    // ── Execute the filing workflow ─────────────────────────────────────────
    await navigateToPortal(page);
    await login(page, kraPin, password);
    await navigateToNilReturn(page);
    await submitNilReturnForm(page);
    const acknowledgementNumber = await confirmNilReturn(page);

    logger.step(`[Job ${jobLabel}] NIL return filed successfully`);

    return {
      success: true,
      acknowledgementNumber: acknowledgementNumber || 'N/A',
    };

  } catch (err) {
    logger.error(`[Job ${jobLabel}] Filing failed: ${err.message}`);

    // Capture debug artifacts if the page is still open
    let artifacts = null;
    if (page) {
      try {
        artifacts = await captureDebugArtifacts(page, jobLabel);
      } catch (captureErr) {
        logger.error(`Failed to capture debug artifacts: ${captureErr.message}`);
      }
    }

    return {
      success: false,
      error: err.message,
      artifacts,
    };

  } finally {
    // Always close the browser to free resources
    if (browser) {
      try {
        await browser.close();
        logger.step(`[Job ${jobLabel}] Browser closed`);
      } catch (closeErr) {
        logger.error(`Failed to close browser: ${closeErr.message}`);
      }
    }
  }
}

module.exports = { fileNilReturn };
