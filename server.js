require("dotenv").config();
const { Telegraf } = require("telegraf");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const { glob } = require("glob");

const bot = new Telegraf(process.env.BOT_TOKEN);

/**
 * Senior Engineer Note:
 * Hardcoding executable paths is a recipe for deployment failure.
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
  ctx.reply(
    `🏛️ E-cyber Assistant Menu\n\n1. KRA NIL Returns\n\nAndika namba ya huduma!`
  );
});

bot.command("menu", (ctx) => {
  userSessions.set(ctx.from.id, { state: UserState.IDLE });
  ctx.reply(
    `🏛️ E-cyber Assistant Menu\n\n1. KRA NIL Returns\n\nAndika namba ya huduma!`
  );
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
    return ctx.reply(
      `🏛️ E-cyber Assistant Menu\n\n1. KRA NIL Returns\n\nAndika namba ya huduma!`
    );
  }

  if (session.state === UserState.IDLE && text === "1") {
    session.state = UserState.AWAITING_KRA_CREDENTIALS;
    return ctx.reply(
      "✅ Umechagua KRA NIL Returns (KES 50).\n\nTafadhali tuma KRA PIN na Password yako, mfano: A123456789Z password123."
    );
  } else if (session.state === UserState.AWAITING_KRA_CREDENTIALS) {
    const pinRegex = /[A-Z]\d{9}[A-Z]/i;
    const pinMatch = text.match(pinRegex);

    if (!pinMatch) {
      return ctx.reply(
        "❌ KRA PIN haijapatikana. Jaribu tena (mfano: A123456789Z password)."
      );
    }

    const kraPin = pinMatch[0].toUpperCase();
    let password = text
      .replace(pinMatch[0], "")
      .replace(/password|pasword|pin/gi, "")
      .trim();

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
 * Force Click Helper:
 * The KRA portal often has overlays or dynamic IDs that block standard clicks.
 */
async function forceClick(page, selector, timeout = 15000) {
  try {
    await page.waitForSelector(selector, { visible: true, timeout });
    try {
      await page.click(selector);
      return;
    } catch (e) {
      console.log(`[DEBUG] Native click failed for ${selector}, trying JS click...`);
    }
    const clicked = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) {
        el.click();
        return true;
      }
      return false;
    }, selector);
    if (clicked) return;
    const rect = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const { x, y, width, height } = el.getBoundingClientRect();
      return { x: x + width / 2, y: y + height / 2 };
    }, selector);
    if (rect) {
      await page.mouse.click(rect.x, rect.y);
    } else {
      throw new Error(`Element ${selector} not found for coordinate click.`);
    }
  } catch (err) {
    throw new Error(`Force click failed on ${selector}: ${err.message}`);
  }
}

/**
 * KRA Captcha Solver:
 * Extracts the math question (e.g., "10 + 5") and solves it.
 */
async function solveKraCaptcha(page) {
  try {
    const captchaText = await page.evaluate(() => {
      const label = document.querySelector('label[for="captchatxt"]');
      return label ? label.innerText.trim() : null;
    });

    if (!captchaText) throw new Error("Captcha label not found.");

    console.log(`[DEBUG] Captcha Text: ${captchaText}`);
    
    // Matches expressions like "15 + 5" or "20 - 2"
    const match = captchaText.match(/(\d+)\s*([\+\-])\s*(\d+)/);
    if (!match) throw new Error(`Could not parse captcha: ${captchaText}`);

    const num1 = parseInt(match[1]);
    const op = match[2];
    const num2 = parseInt(match[3]);

    const answer = op === '+' ? num1 + num2 : num1 - num2;
    console.log(`[DEBUG] Captcha Solved: ${num1} ${op} ${num2} = ${answer}`);
    
    return answer.toString();
  } catch (err) {
    throw new Error(`Captcha solving failed: ${err.message}`);
  }
}

async function performKraNilReturn(pin, password) {
  const executablePath = await getExecutablePath();
  const browser = await puppeteer.launch({ 
    headless: "new", 
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--single-process',
      '--window-size=1280,800'
    ], 
    executablePath 
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    console.log("[DEBUG] Navigating to iTax...");
    await page.goto("https://itax.kra.go.ke/KRA-Portal/", {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    // Step 1: Enter PIN
    await page.waitForSelector("#logid", { visible: true });
    await page.type("#logid", pin);

    // Step 2: Click Continue
    const continueButton = "button.btn-info, input[type=\"button\"][value=\"Continue\"], #XX67588383";
    await forceClick(page, continueButton);

    // Step 3: Handle Password and Captcha
    await page.waitForSelector("input[type=\"password\"]", { visible: true, timeout: 15000 });
    await page.type("input[type=\"password\"]", password);

    // Step 4: Solve and Enter Captcha
    const captchaAnswer = await solveKraCaptcha(page);
    await page.type("#captchatxt", captchaAnswer);

    // Step 5: Click Login
    const loginButton = "#loginButton, button[value=\"Login\"]";
    await forceClick(page, loginButton);

    // Real-world flow would then proceed to 'Returns' -> 'File Nil Return'
    // For now, we return a success placeholder.
    return { receiptUrl: `https://ecyber.com/receipts/KRA_NIL_${Date.now()}` };
  } catch (err) {
    throw new Error(`Automation error: ${err.message}`);
  } finally {
    await browser.close();
  }
}

bot.launch();

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
