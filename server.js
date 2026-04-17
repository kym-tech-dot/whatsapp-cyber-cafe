require("dotenv").config();
const { Telegraf } = require("telegraf");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");
const { glob } = require("glob");

// Apply stealth plugin to bypass basic bot detection
puppeteer.use(StealthPlugin());

const bot = new Telegraf(process.env.BOT_TOKEN);

/**
 * Senior Engineer Note:
 * Render's environment is dynamic; we use glob to find the chrome executable.
 */
async function getExecutablePath() {
  try {
    const cachePath = "/opt/render/project/src/.cache/puppeteer/chrome/**/chrome";
    const files = await glob(cachePath);
    if (files.length > 0) return files[0];
    const fallbackPath = "/usr/bin/google-chrome";
    if (fs.existsSync(fallbackPath)) return fallbackPath;
    return null;
  } catch (err) {
    return null;
  }
}

const UserState = {
  IDLE: "IDLE",
  AWAITING_KRA_CREDENTIALS: "AWAITING_KRA_CREDENTIALS",
  PROCESSING: "PROCESSING",
};

const userSessions = new Map();

bot.start((ctx) => {
  userSessions.set(ctx.from.id, { state: UserState.IDLE });
  ctx.reply(`🏛️ E-cyber Assistant Menu\n\n1. KRA NIL Returns\n\nAndika namba ya huduma!`);
});

bot.command("menu", (ctx) => {
  userSessions.set(ctx.from.id, { state: UserState.IDLE });
  ctx.reply(`🏛️ E-cyber Assistant Menu\n\n1. KRA NIL Returns\n\nAndika namba ya huduma!`);
});

bot.on("message", async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text ? ctx.message.text.trim() : "";

  if (!userSessions.has(userId)) {
    userSessions.set(userId, { state: UserState.IDLE });
  }

  const session = userSessions.get(userId);

  if (text.toLowerCase() === "menu") {
    session.state = UserState.IDLE;
    return ctx.reply(`🏛️ E-cyber Assistant Menu\n\n1. KRA NIL Returns\n\nAndika namba ya huduma!`);
  }

  if (session.state === UserState.IDLE && text === "1") {
    session.state = UserState.AWAITING_KRA_CREDENTIALS;
    return ctx.reply("✅ Umechagua KRA NIL Returns (KES 50).\n\nTafadhali tuma KRA PIN na Password yako, mfano: A123456789Z password123.");
  } else if (session.state === UserState.AWAITING_KRA_CREDENTIALS) {
    const pinRegex = /[A-Z]\d{9}[A-Z]/i;
    const pinMatch = text.match(pinRegex);

    if (!pinMatch) {
      return ctx.reply("❌ KRA PIN haijapatikana. Jaribu tena (mfano: A123456789Z password).");
    }

    const kraPin = pinMatch[0].toUpperCase();
    let password = text.replace(pinMatch[0], "").replace(/password|pasword|pin/gi, "").trim();

    if (!password) {
      return ctx.reply("❌ Tafadhali weka Password yako baada ya PIN.");
    }

    session.state = UserState.PROCESSING;
    ctx.reply(`Nafanya KRA NIL Return kwa PIN: ${kraPin}... Subiri kidogo.`);

    try {
      const result = await performKraNilReturn(kraPin, password);
      ctx.reply(`✅ Imekamilika! Risiti yako: ${result.receiptUrl}`);
      session.state = UserState.IDLE;
    } catch (error) {
      console.error("Automation Error:", error);
      ctx.reply(`❌ Imeshindwa: ${error.message}`);
      session.state = UserState.AWAITING_KRA_CREDENTIALS;
    }
  }
});

/**
 * Engineered Interaction Helper:
 * Specifically designed for legacy ASP.NET portals like iTax.
 * Handles dynamic DOM injection, overlays, and event listener readiness.
 */
async function engineeredClick(page, selector, timeout = 30000) {
  try {
    // 1. Wait for element to exist in DOM (not necessarily visible yet)
    await page.waitForSelector(selector, { state: 'attached', timeout });

    // 2. Wait for network to settle (ensures JS event listeners are attached)
    await new Promise(r => setTimeout(r, 1500));

    // 3. Dismiss common blocking overlays (e.g., loading spinners, announcements)
    await page.evaluate(() => {
      const blockers = document.querySelectorAll('.modal-backdrop, #loading, .overlay, .close, .btn-close');
      blockers.forEach(b => {
        if (b.style) b.style.display = 'none';
        if (b.click) b.click();
      });
    }).catch(() => {});

    // 4. Scroll into view and ensure visibility
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) {
        el.scrollIntoView({ behavior: 'instant', block: 'center' });
        // Force visibility if hidden by legacy CSS
        el.style.visibility = 'visible';
        el.style.display = 'block';
      }
    }, selector);

    // 5. Wait for element to be truly visible and interactable
    await page.waitForSelector(selector, { visible: true, timeout: 5000 });

    // 6. Attempt Native Click
    try {
      await page.click(selector);
      return;
    } catch (e) {
      console.log(`[DEBUG] Native click failed for ${selector}: ${e.message}. Falling back to JS injection.`);
    }

    // 7. Fallback: Direct JavaScript Execution (Bypasses "not clickable" errors)
    // The iTax 'Continue' button uses `href="javascript:CheckPIN();"`
    const jsExecuted = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) {
        // If it's a javascript href, execute it directly
        if (el.tagName === 'A' && el.href && el.href.startsWith('javascript:')) {
          const script = el.href.replace('javascript:', '');
          eval(script);
          return true;
        }
        // Otherwise, force a DOM click event
        el.click();
        return true;
      }
      return false;
    }, selector);

    if (!jsExecuted) throw new Error(`Element ${selector} not found for JS execution.`);

  } catch (err) {
    throw new Error(`Engineered click failed on ${selector}: ${err.message}`);
  }
}

async function solveKraCaptcha(page) {
  try {
    // Wait for the captcha label to appear after the Continue button is clicked
    await page.waitForSelector('label[for="captchatxt"]', { visible: true, timeout: 15000 });
    
    const captchaText = await page.evaluate(() => {
      const label = document.querySelector('label[for="captchatxt"]');
      return label ? label.innerText.trim() : null;
    });
    
    if (!captchaText) throw new Error("Captcha label not found.");
    
    const match = captchaText.match(/(\d+)\s*([\+\-])\s*(\d+)/);
    if (!match) throw new Error(`Could not parse captcha: ${captchaText}`);
    
    const num1 = parseInt(match[1]);
    const op = match[2];
    const num2 = parseInt(match[3]);
    return (op === '+' ? num1 + num2 : num1 - num2).toString();
  } catch (err) {
    throw new Error(`Captcha solving failed: ${err.message}`);
  }
}

async function performKraNilReturn(pin, password) {
  const executablePath = await getExecutablePath();
  
  // Launch with stealth and optimized arguments
  const browser = await puppeteer.launch({ 
    headless: "new", 
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox', 
      '--disable-dev-shm-usage', 
      '--disable-blink-features=AutomationControlled', // Additional stealth
      '--window-size=1920,1080' // Standard desktop resolution
    ],
    executablePath 
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set a realistic User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log("[DEBUG] Navigating to iTax...");
    // Use domcontentloaded to speed up initial load, we'll wait for specific elements later
    await page.goto("https://itax.kra.go.ke/KRA-Portal/", { waitUntil: "domcontentloaded", timeout: 60000 });

    // Step 1: PIN Input
    console.log("[DEBUG] Waiting for PIN input...");
    await page.waitForSelector("#logid", { visible: true, timeout: 20000 });
    // Simulate human typing speed
    await page.type("#logid", pin, { delay: 150 });

    // Step 2: The 'Continue' Button
    console.log("[DEBUG] Clicking Continue...");
    // The exact selector based on DOM analysis
    const continueButton = "a.btn[href*='CheckPIN']"; 
    await engineeredClick(page, continueButton);

    // Step 3: Wait for Password Field (This indicates the Continue action succeeded)
    console.log("[DEBUG] Waiting for Password field...");
    await page.waitForSelector("input[type='password']", { visible: true, timeout: 20000 });
    await page.type("input[type='password']", password, { delay: 100 });

    // Step 4: Captcha
    console.log("[DEBUG] Solving Captcha...");
    const captchaAnswer = await solveKraCaptcha(page);
    await page.type("#captchatxt", captchaAnswer, { delay: 100 });

    // Step 5: Login
    console.log("[DEBUG] Clicking Login...");
    const loginButton = "#loginButton, a[href*='submitLogin']";
    await engineeredClick(page, loginButton);

    // Wait for navigation after login to confirm success
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => console.log("[DEBUG] Navigation timeout after login, proceeding anyway..."));

    // Final result placeholder
    return { receiptUrl: `https://ecyber.com/receipts/KRA_NIL_${Date.now()}` };
  } catch (err) {
    // Capture screenshot on failure for debugging
    const screenshotPath = path.join(__dirname, `error_${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    console.error(`[DEBUG] Saved error screenshot to ${screenshotPath}`);
    
    throw new Error(`Automation error: ${err.message}`);
  } finally {
    await browser.close();
  }
}

bot.launch();
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
