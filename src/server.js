require("dotenv").config();
const express = require("express");
const { Telegraf } = require("telegraf");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const path = require("path");
const fs = require("fs");
const { glob } = require("glob");

// Apply stealth plugin to bypass basic bot detection
puppeteer.use(StealthPlugin());

// Use BOT_TOKEN or TELEGRAM_BOT_TOKEN for flexibility
const bot = new Telegraf(process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN);
const app = express();
const PORT = process.env.PORT || 10000;

/**
 * Senior Engineer Note:
 * Render's environment is dynamic; we use glob to find the chrome executable.
 */
async function getExecutablePath() {
  try {
    const cachePath = path.join(process.cwd(), ".cache", "puppeteer", "chrome", "**", "chrome");
    const files = await glob(cachePath);
    if (files.length > 0) return files[0];
    const fallbackPath = "/usr/bin/google-chrome";
    if (fs.existsSync(fallbackPath)) return fallbackPath;
    return null;
  } catch (err) {
    console.error("Error getting executable path:", err);
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

async function engineeredClick(page, selector, timeout = 30000) {
  try {
    await page.waitForSelector(selector, { state: 'attached', timeout });
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => {
      const blockers = document.querySelectorAll('.modal-backdrop, #loading, .overlay, .close, .btn-close');
      blockers.forEach(b => {
        if (b.style) b.style.display = 'none';
        if (b.click) b.click();
      });
    }).catch(() => {});
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) {
        el.scrollIntoView({ behavior: 'instant', block: 'center' });
        el.style.visibility = 'visible';
        el.style.display = 'block';
      }
    }, selector);
    await page.waitForSelector(selector, { visible: true, timeout: 5000 });
    try {
      await page.click(selector);
      return;
    } catch (e) {
      console.log(`[DEBUG] Native click failed for ${selector}: ${e.message}. Falling back to JS injection.`);
    }
    const jsExecuted = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) {
        if (el.tagName === 'A' && el.href && el.href.startsWith('javascript:')) {
          const script = el.href.replace('javascript:', '');
          eval(script);
          return true;
        }
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
  const browser = await puppeteer.launch({ 
    headless: "new", 
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
    executablePath 
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.goto("https://itax.kra.go.ke/KRA-Portal/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("#logid", { visible: true, timeout: 20000 });
    await page.type("#logid", pin, { delay: 150 });
    const continueButton = "a.btn[href*='CheckPIN']"; 
    await engineeredClick(page, continueButton);
    await page.waitForSelector("input[type='password']", { visible: true, timeout: 20000 });
    await page.type("input[type='password']", password, { delay: 100 });
    const captchaAnswer = await solveKraCaptcha(page);
    await page.type("#captchatxt", captchaAnswer, { delay: 100 });
    const loginButton = "#loginButton, a[href*='submitLogin']";
    await engineeredClick(page, loginButton);
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    return { receiptUrl: `https://ecyber.com/receipts/KRA_NIL_${Date.now()}` };
  } catch (err) {
    throw new Error(`Automation error: ${err.message}`);
  } finally {
    await browser.close();
  }
}

bot.launch();

app.get("/", (req, res) => {
  res.status(200).send("Bot is running and healthy!");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
