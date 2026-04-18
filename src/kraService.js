import puppeteer from "puppeteer";
import readline from "readline";

// 🔐 CAPTCHA HANDLER (IMEONGEZWA JUU)
async function handleCaptcha(page) {
  console.log("[KRA-LOG]: Checking CAPTCHA...");

  const captchaSelectors = [
    'img[src*="captcha"]',
    '#captchaImg',
    'img[alt*="captcha"]'
  ];

  let captchaElement = null;

  for (const sel of captchaSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 5000 });
      captchaElement = await page.$(sel);
      if (captchaElement) break;
    } catch {}
  }

  if (!captchaElement) {
    console.log("[CAPTCHA]: Hakuna captcha imeonekana");
    return;
  }

  console.log("[CAPTCHA]: Imeonekana!");

  const path = "captcha.png";
  await captchaElement.screenshot({ path });

  console.log("👉 Fungua captcha.png uandike code:");

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

  // Ingiza captcha
  const inputSelectors = [
    'input[name="captcha"]',
    '#captcha',
    'input[type="text"]'
  ];

  for (const sel of inputSelectors) {
    const input = await page.$(sel);
    if (input) {
      await page.type(sel, answer, { delay: 50 });
      console.log("[CAPTCHA]: Imewekwa");
      return;
    }
  }

  console.log("[CAPTCHA]: Field haijaonekana!");
}

// 🚀 MAIN FUNCTION
async function runKRA(pin, password) {
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();

  try {
    console.log("[KRA-LOG]: Inafungua KRA iTax...");
    await page.goto("https://itax.kra.go.ke", {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    await page.screenshot({ path: "step1_open.png" });

    console.log("[KRA-LOG]: Inaingiza PIN...");

    await page.waitForSelector('input[name="pin"], #pin, input[type="text"]', {
      timeout: 60000
    });

    await page.type('input[name="pin"], #pin, input[type="text"]', pin, {
      delay: 50
    });

    // 🔥 CAPTCHA BEFORE CONTINUE
    await handleCaptcha(page);

    console.log("[KRA-LOG]: Inabofya Continue...");

    await Promise.all([
      page.click('input[type="submit"], button[type="submit"], #btnLogin'),
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 })
    ]);

    console.log("[KRA-LOG]: Inasubiri Password...");

    let passwordSelector = null;

    const selectors = [
      'input[type="password"]',
      '#password',
      'input[name="password"]'
    ];

    for (const sel of selectors) {
      try {
        await page.waitForSelector(sel, { timeout: 15000 });
        passwordSelector = sel;
        break;
      } catch (err) {
        console.log(`[DEBUG]: Selector failed -> ${sel}`);
      }
    }

    if (!passwordSelector) {
      await page.screenshot({ path: "error_no_password.png" });
      const html = await page.content();
      console.log("[DEBUG HTML]:", html.substring(0, 2000));
      throw new Error("Password field not found");
    }

    console.log("[KRA-LOG]: Inaingiza Password...");
    await page.type(passwordSelector, password, { delay: 50 });

    // 🔥 CAPTCHA AGAIN (IMPORTANT)
    await handleCaptcha(page);

    console.log("[KRA-LOG]: Inalogin...");

    await Promise.all([
      page.click('input[type="submit"], button[type="submit"]'),
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 })
    ]);

    console.log("[KRA-LOG]: Login successful!");
    await page.screenshot({ path: "success.png" });

  } catch (error) {
    console.error("❌ IMEFELI:", error.message);
    await page.screenshot({ path: "final_error.png" });
  }
}

// 🧪 TEST
runKRA("A123456789X", "your_password_here");
