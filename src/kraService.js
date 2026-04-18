import puppeteer from "puppeteer";
import readline from "readline";

async function handleCaptcha(page) {
  const captchaSelectors = [
    'img[src*="captcha"]',
    '#captchaImg',
    'img[alt*="captcha"]'
  ];

  let captchaElement = null;

  for (const sel of captchaSelectors) {
    try {
      captchaElement = await page.$(sel);
      if (captchaElement) break;
    } catch {}
  }

  if (!captchaElement) return;

  await captchaElement.screenshot({ path: "captcha.png" });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const answer = await new Promise(resolve =>
    rl.question("CAPTCHA: ", ans => {
      rl.close();
      resolve(ans);
    })
  );

  const inputs = [
    'input[name="captcha"]',
    '#captcha',
    'input[type="text"]'
  ];

  for (const sel of inputs) {
    const el = await page.$(sel);
    if (el) {
      await page.type(sel, answer, { delay: 50 });
      return;
    }
  }
}

async function runKRA(pin, password) {
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();

  try {
    await page.goto("https://itax.kra.go.ke", {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    await page.type('input[name="pin"], #pin, input[type="text"]', pin, {
      delay: 50
    });

    await handleCaptcha(page);

    await Promise.all([
      page.click('input[type="submit"], button[type="submit"], #btnLogin'),
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 })
    ]);

    // WAIT UNTIL PASSWORD APPEARS (FIXED CRASH)
    await page.waitForFunction(() => {
      return (
        document.querySelector('input[type="password"]') ||
        document.querySelector('#password') ||
        document.querySelector('input[name="password"]')
      );
    }, { timeout: 60000 });

    let passwordSelector =
      (await page.$('input[type="password"]')) ||
      (await page.$('#password')) ||
      (await page.$('input[name="password"]'));

    if (!passwordSelector) {
      await page.screenshot({ path: "error_password.png" });
      throw new Error("Password field haijapatikana");
    }

    await page.type(
      'input[type="password"], #password, input[name="password"]',
      password,
      { delay: 50 }
    );

    await handleCaptcha(page);

    await Promise.all([
      page.click('input[type="submit"], button[type="submit"]'),
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 })
    ]);

    await page.screenshot({ path: "success.png" });

  } catch (err) {
    await page.screenshot({ path: "error.png" });
    console.error("❌ IMEFELI:", err.message);
  }
}

