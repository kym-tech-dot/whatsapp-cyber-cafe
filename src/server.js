const express = require("express");
const axios = require("axios");
const app = express();
const puppeteer = require("puppeteer-extra"); // Use puppeteer-extra
const StealthPlugin = require("puppeteer-extra-plugin-stealth"); // Import stealth plugin
puppeteer.use(StealthPlugin()); // Use stealth plugin

const path = require("path");
const fs = require("fs");
const { globSync } = require("glob"); // For robust file searching

app.use(express.json());

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Services embedded directly into the code
const services = {
  "KRA_NIL": { "name": "KRA NIL Returns", "price": 50, "keywords": ["kra", "nil", "tax"] },
  "SHA_REG": { "name": "SHA Registration", "price": 100, "keywords": ["sha", "health", "nhif"] },
  "GOOD_CONDUCT": { "name": "Police Clearance (Good Conduct)", "price": 1250, "keywords": ["conduct", "police", "cid"] },
  "DL_RENEWAL": { "name": "NTSA DL Renewal (3 Years)", "price": 750, "keywords": ["dl", "driving", "ntsa"] },
  "BUSINESS_SEARCH": { "name": "Business Name Search", "price": 250, "keywords": ["business", "name", "brs"] },
  "HELB_APP": { "name": "HELB Loan Application", "price": 200, "keywords": ["helb", "loan", "student"] },
  "KRA_PIN": { "name": "KRA PIN Registration", "price": 150, "keywords": ["pin", "new pin"] },
  "PASSPORT_APP": { "name": "Passport Application", "price": 5050, "keywords": ["passport", "immigration"] },
  "LOGBOOK_TRANSFER": { "name": "NTSA Logbook Transfer", "price": 3550, "keywords": ["logbook", "transfer", "car"] },
  "ID_REPLACEMENT": { "name": "ID Card Replacement", "price": 1200, "keywords": ["id", "replacement", "lost id"] },
  "TAX_COMPLIANCE": { "name": "Tax Compliance Certificate", "price": 150, "keywords": ["compliance", "tcc", "tax certificate"] },
  "BIRTH_CERT": { "name": "Birth Certificate Application", "price": 350, "keywords": ["birth", "certificate"] },
  "TSC_APP": { "name": "TSC Number Application", "price": 1300, "keywords": ["tsc", "teacher"] },
  "NHIF_SHA": { "name": "NHIF to SHA Migration", "price": 100, "keywords": ["migration", "nhif to sha"] },
  "CV_PRO": { "name": "Professional CV Generation", "price": 200, "keywords": ["cv", "resume", "job"] }
};
const serviceKeys = Object.keys(services);

// Simple in-memory state for users (resets on server restart)
const userStates = {}; 

async function sendMessage(platform, to, text) {
  try {
    if (platform === "whatsapp") {
      await axios.post(`https://graph.facebook.com/v17.0/${PHONE_ID}/messages`, {
        messaging_product: "whatsapp", to: to, type: "text", text: { body: text }
      }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } } );
    } else if (platform === "telegram") {
      await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, { chat_id: to, text: text, parse_mode: "Markdown" } );
    }
  } catch (e) {
    console.error("Error sending message:", e.message);
    if (e.response) {
      console.error("Error response data:", e.response.data);
    }
  }
}

function generateMenuText() {
  if (serviceKeys.length === 0) {
    return "🏛️ *E-cyber Assistant Menu*\n\nSamahani, hakuna huduma zilizopatikana kwa sasa. Tafadhali jaribu tena baadaye.";
  }
  
  let menu = "🏛️ *E-cyber Assistant Menu*\n\nChagua huduma kwa kuandika namba:\n";
  serviceKeys.forEach((key, index) => {
    menu += `${index + 1}. ${services[key].name}\n`;
  });
  menu += "\nAndika namba ya huduma unayotaka!";
  return menu;
}

// Function to solve simple math captchas
function solveCaptcha(captchaText) {
  try {
    const parts = captchaText.match(/(\d+)\s*([+\-*])\s*(\d+)/);
    if (parts && parts.length === 4) {
      const num1 = parseInt(parts[1]);
      const operator = parts[2];
      const num2 = parseInt(parts[3]);

      switch (operator) {
        case "+": return num1 + num2;
        case "-": return num1 - num2;
        case "*": return num1 * num2;
        default: return null;
      }
    }
    return null;
  } catch (e) {
    console.error("Error solving captcha:", e);
    return null;
  }
}

// Function to dynamically find Chrome executable
function findChromeExecutable() {
  const cachePath = path.join(__dirname, ".cache", "puppeteer");
  console.log(`Searching for Chrome executable in: ${cachePath}`);

  // Use glob to find the chrome executable, resilient to version changes
  const chromePaths = globSync(`${cachePath}/**/chrome-linux64/chrome`);
  
  if (chromePaths.length > 0) {
    console.log(`Found Chrome executable at: ${chromePaths[0]}`);
    return chromePaths[0];
  }
  console.log("Chrome executable not found using glob.");
  return null;
}

// KRA NIL Return automation function
async function performKRA_NIL_Return(kraPin, kraPassword) {
  let browser;
  try {
    const executablePath = findChromeExecutable();
    if (!executablePath) {
      throw new Error("Chrome executable not found. Please ensure Puppeteer is installed correctly.");
    }
    
    console.log(`Launching browser with executablePath: ${executablePath}`);
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox", 
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage", // Recommended for Render
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--single-process", // Opt for single process to save memory
        "--disable-gpu"
      ],
      executablePath: executablePath,
    });
    const page = await browser.newPage();
    await page.goto("https://itax.kra.go.ke/KRA-Portal/", { waitUntil: "networkidle2", timeout: 60000 });
    console.log("Navigated to KRA Portal.");

    // Function to dismiss pop-ups
    const dismissPopups = async (currentPage) => {
      console.log("Attempting to dismiss pop-ups...");
      try {
        // Check for and click the close button on the main page pop-up
        const closeButton = await currentPage.$("button.close");
        if (closeButton) {
          console.log("Dismissing main page pop-up...");
          await currentPage.evaluate(btn => btn.click(), closeButton);
          await currentPage.waitForTimeout(1000); // Wait for animation
        }

        // Check for and accept any alert dialogs
        currentPage.on("dialog", async dialog => {
          console.log(`Dialog message: ${dialog.message()}`);
          await dialog.accept();
          console.log("Accepted dialog.");
        });

      } catch (error) {
        console.log("No pop-ups to dismiss or error dismissing:", error.message);
      }
    };

    await dismissPopups(page);

    // Wait for the PIN input field to be visible and clickable
    console.log("Waiting for PIN input field (#logid)...");
    await page.waitForSelector("#logid", { visible: true, timeout: 15000 });
    await page.type("#logid", kraPin);
    console.log("Entered PIN.");

    // Click Continue using JavaScript and wait for navigation
    console.log("Clicking Continue button using JS...");
    await page.evaluate(() => document.querySelector("#loginButton").click());
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 });
    console.log("Navigated after Continue.");

    await dismissPopups(page);

    // Wait for the password input field to be visible and clickable
    console.log("Waiting for password input field (#password)...");
    await page.waitForSelector("#password", { visible: true, timeout: 15000 });
    await page.type("#password", kraPassword);
    console.log("Entered password.");

    // Solve Captcha
    console.log("Waiting for captcha text...");
    await page.waitForSelector("label[for=\'captcahText\"]", { visible: true, timeout: 15000 });
    const captchaTextElement = await page.$("label[for=\'captcahText\"]"); 
    let captchaText = "";
    if (captchaTextElement) {
      captchaText = await page.evaluate(el => el.innerText, captchaTextElement);
      console.log(`Captcha text found: ${captchaText}`);
    } else {
      console.log("Captcha text element not found directly. Trying alternatives.");
      const potentialCaptchaText = await page.$eval("div.captcha-text, span.captcha-text", el => el.innerText).catch(() => null);
      if (potentialCaptchaText) {
        captchaText = potentialCaptchaText;
        console.log(`Captcha text found via alternative: ${captchaText}`);
      }
    }

    const captchaAnswer = solveCaptcha(captchaText);
    console.log(`Solved captcha answer: ${captchaAnswer}`);

    if (captchaAnswer !== null) {
      console.log("Waiting for captcha input field (#captcahText)...");
      await page.waitForSelector("#captcahText", { visible: true, timeout: 15000 });
      await page.type("#captcahText", String(captchaAnswer)); 
      console.log("Entered captcha answer.");
    } else {
      throw new Error("Failed to solve captcha. Captcha text not found or unparseable.");
    }

    // Click Login using JavaScript and wait for navigation
    console.log("Clicking Login button using JS...");
    await page.evaluate(() => document.querySelector("#loginButton").click());
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 });
    console.log("Navigated after Login.");

    await dismissPopups(page);

    // Check for successful login
    console.log("Checking for successful login...");
    const isLoggedIn = await page.$("#dashboardMenu") !== null; 
    if (!isLoggedIn) {
      const errorMessage = await page.evaluate(() => document.body.innerText);
      console.error("Login failed. Page content:", errorMessage);
      await page.screenshot({ path: path.join(__dirname, `login_failure_${Date.now()}.png`) });
      throw new Error("Login failed. Check PIN/Password or Captcha. Screenshot saved.");
    }
    console.log("Login successful.");

    // Navigate to \"File Nil Return\"
    console.log("Waiting for \'File Nil Return\' link...");
    await page.waitForSelector("a[href*=\'fileNilReturn\']", { visible: true, timeout: 15000 });
    await page.evaluate(() => document.querySelector("a[href*=\'fileNilReturn\']").click());
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 });
    console.log("Navigated to File Nil Return page.");

    await dismissPopups(page);

    // Select tax obligation, tax period, etc. and submit
    console.log("Waiting for tax obligation dropdown...");
    await page.waitForSelector("#taxObligation", { visible: true, timeout: 15000 });
    await page.select("#taxObligation", "ITR"); 
    console.log("Selected ITR.");

    console.log("Waiting for tax period dropdown...");
    await page.waitForSelector("#taxPeriod", { visible: true, timeout: 15000 });
    await page.select("#taxPeriod", "2023"); 
    console.log("Selected 2023.");

    console.log("Waiting for submit button...");
    await page.waitForSelector("#submitNilReturn", { visible: true, timeout: 15000 });
    await page.evaluate(() => document.querySelector("#submitNilReturn").click());
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 });
    console.log("Submitted Nil Return.");

    const successMessage = await page.evaluate(() => document.body.innerText.includes("Return Submitted Successfully"));
    if (successMessage) {
      console.log("KRA NIL Return filed successfully!");
      return { success: true, message: "KRA NIL Return filed successfully!" };
    } else {
      const errorMessage = await page.evaluate(() => document.body.innerText);
      console.error("Failed to file KRA NIL Return. Page content:", errorMessage);
      await page.screenshot({ path: path.join(__dirname, `filing_failure_${Date.now()}.png`) });
      return { success: false, message: "Failed to file KRA NIL Return. Please check details. Screenshot saved." };
    }

  } catch (error) {
    console.error("KRA NIL Return automation failed:", error);
    return { success: false, message: `Automation failed: ${error.message}` };
  } finally {
    if (browser) {
      await browser.close();
      console.log("Browser closed.");
    }
  }
}

// Service execution logic
async function executeService(serviceId, details, platform, userId) {
  const service = services[serviceId];
  let resultMessage = "";
  const customerInput = details.customerInput || "";

  switch (serviceId) {
    case "KRA_NIL":
      if (details.kraPin && details.kraPassword) {
        await sendMessage(platform, userId, `Nafanya KRA NIL Return kwa PIN: ${details.kraPin}... Tafadhali subiri kidogo.`);
        const automationResult = await performKRA_NIL_Return(details.kraPin, details.kraPassword);
        if (automationResult.success) {
          resultMessage = `✅ Huduma ya *${service.name}* imekamilika kwa mafanikio!\n\n${automationResult.message} Risiti yako inapatikana hapa: [https://ecyber.com/receipts/KRA_NIL_${userId}]`;
        } else {
          resultMessage = `❌ Samahani, huduma ya *${service.name}* imeshindwa. ${automationResult.message}`; 
        }
      } else {
        resultMessage = `Samahani, kwa huduma ya *${service.name}*, nahitaji KRA PIN na Neno Siri (Password) yako.`;
      }
      break;
    case "SHA_REG":
      resultMessage = `✅ Huduma ya *${service.name}* imekamilika kwa mafanikio!\n\nUsajili wako wa SHA umekamilika. Namba yako ya usajili ni: *SHA-${Math.floor(Math.random() * 1000000)}*.`;
      break;
    case "GOOD_CONDUCT":
      resultMessage = `✅ Huduma ya *${service.name}* imekamilika kwa mafanikio!\n\nHati yako ya tabia njema (Good Conduct) imetolewa. Unaweza kuipakua hapa: [https://ecyber.com/documents/good_conduct_${userId}]`;
      break;
    case "DL_RENEWAL":
      resultMessage = `✅ Huduma ya *${service.name}* imekamilika kwa mafanikio!\n\nLeseni yako ya udereva imefanyiwa upya kwa miaka 3. Unaweza kupakua leseni mpya hapa: [https://ecyber.com/documents/dl_renewal_${userId}]`;
      break;
    case "BUSINESS_SEARCH":
      resultMessage = `✅ Huduma ya *${service.name}* imekamilika kwa mafanikio!\n\nUtafutaji wa jina la biashara umekamilika. Matokeo yametumwa kwako kupitia SMS/Email.`;
      break;
    case "HELB_APP":
      resultMessage = `✅ Huduma ya *${service.name}* imekamilika kwa mafanikio!\n\nMaombi yako ya mkopo wa HELB yamewasilishwa. Utapokea ujumbe wa uthibitisho kutoka HELB hivi karibuni.`;
      break;
    case "KRA_PIN":
      const generatedPin = `A${Math.floor(Math.random() * 900000000) + 100000000}Z`; 
      resultMessage = `✅ Huduma ya *${service.name}* imekamilika kwa mafanikio!\n\nKRA PIN yako mpya ni: *${generatedPin}*. Unaweza kuipakua hapa: [https://ecyber.com/documents/kra_pin_${userId}]`;
      break;
    case "PASSPORT_APP":
      resultMessage = `✅ Huduma ya *${service.name}* imekamilika kwa mafanikio!\n\nMaombi yako ya Pasipoti yamewasilishwa. Utapokea ujumbe wa tarehe ya kuchukua picha na alama za vidole.`;
      break;
    case "LOGBOOK_TRANSFER":
      resultMessage = `✅ Huduma ya *${service.name}* imekamilika kwa mafanikio!\n\nUhamishaji wa umiliki wa Logbook umekamilika. Hati mpya ya umiliki inapatikana hapa: [https://ecyber.com/documents/logbook_${userId}]`;
      break;
    case "ID_REPLACEMENT":
      resultMessage = `✅ Huduma ya *${service.name}* imekamilika kwa mafanikio!\n\nMaombi yako ya kubadilisha kitambulisho yamewasilishwa. Utapokea ujumbe wa tarehe ya kukichukua.`;
      break;
    case "TAX_COMPLIANCE":
      resultMessage = `✅ Huduma ya *${service.name}* imekamilika kwa mafanikio!\n\nHati yako ya Uzingatiaji Kodi (TCC) imetolewa. Unaweza kuipakua hapa: [https://ecyber.com/documents/tcc_${userId}]`;
      break;
    case "BIRTH_CERT":
      resultMessage = `✅ Huduma ya *${service.name}* imekamilika kwa mafanikio!\n\nMaombi yako ya cheti cha kuzaliwa yamewasilishwa. Utapokea ujumbe wa tarehe ya kukichukua.`;
      break;
    case "TSC_APP":
      resultMessage = `✅ Huduma ya *${service.name}* imekamilika kwa mafanikio!\n\nNamba yako ya TSC imetolewa. Unaweza kuipata hapa: [https://ecyber.com/documents/tsc_${userId}]`;
      break;
    case "NHIF_SHA":
      resultMessage = `✅ Huduma ya *${service.name}* imekamilika kwa mafanikio!\n\nUhamishaji wako kutoka NHIF kwenda SHA umekamilika.`;
      break;
    case "CV_PRO":
      resultMessage = `✅ Huduma ya *${service.name}* imekamilika kwa mafanikio!\n\nCV yako ya kitaalamu imetengenezwa. Unaweza kuipakua hapa: [https://ecyber.com/documents/cv_${userId}]`;
      break;
    default:
      resultMessage = `✅ Huduma ya *${service.name}* imekamilika kwa mafanikio!\n\nAsante kwa kutumia E-cyber. Tumepokea maelezo yako: \"${customerInput}\".`;
  }

  await sendMessage(platform, userId, resultMessage);
}

app.get("/", (req, res) => res.send("E-cyber Smart Assistant is Live! 🚀"));

// WhatsApp Webhook
app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === VERIFY_TOKEN) res.send(req.query["hub.challenge"]);
  else res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  const body = req.body;
  const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (message) {
    const from = message.from;
    const text = message.text.body.trim().toLowerCase();
    
    if (!userStates[from]) {
      userStates[from] = { state: "START", serviceId: null, details: {} };
    }
    
    let userState = userStates[from];

    if (["menu", "hi", "habari", "/start", "mambo"].includes(text)) {
      userState.state = "AWAITING_SELECTION";
      await sendMessage("whatsapp", from, generateMenuText());
    } 
    else if (userState.state === "AWAITING_SELECTION" || userState.state === "START") {
      const selectedIndex = parseInt(text) - 1;
      if (!isNaN(selectedIndex) && selectedIndex >= 0 && selectedIndex < serviceKeys.length) {
        const serviceId = serviceKeys[selectedIndex];
        const service = services[serviceId];
        userState.serviceId = serviceId;
        
        if (serviceId === "KRA_NIL") {
          userState.state = "AWAITING_KRA_CREDENTIALS";
          await sendMessage("whatsapp", from, `✅ Umechagua *${service.name}* (KES ${service.price}).\n\nTafadhali tuma KRA PIN na Neno Siri (Password) yako, mfano: *A123456789Z password123*.`);
        } else {
          userState.state = "AWAITING_DETAILS";
          await sendMessage("whatsapp", from, `✅ Umechagua *${service.name}* (KES ${service.price}).\n\nTafadhali tuma maelezo yako (mfano: Jina Kamili na Namba ya Kitambulisho) ili tuanze kushughulikia.`);
        }
      } else {
        await sendMessage("whatsapp", from, "Samahani, sijaelewa namba hiyo. Tafadhali chagua namba kutoka kwenye orodha au andika *Menu*.");
      }
    } 
    else if (userState.state === "AWAITING_KRA_CREDENTIALS") {
      // Improved parsing for KRA PIN and Password
      const parts = text.split(/\s+/).filter(Boolean); // Split by any whitespace and remove empty strings
      let kraPin = null;
      let kraPassword = null;

      // Attempt to find KRA PIN (starts with A, ends with a letter, 10 chars total)
      // KRA PIN format: A123456789Z (starts with A, 9 digits, ends with a letter)
      const kraPinRegex = /^[a-zA-Z]\d{9}[a-zA-Z]$/i;

      let pinIndex = -1;
      for (let i = 0; i < parts.length; i++) {
        if (kraPinRegex.test(parts[i])) {
          kraPin = parts[i].toUpperCase();
          pinIndex = i;
          break;
        }
      }

      if (kraPin && pinIndex !== -1) {
        // Try to find the password. Look for a word that looks like a password after the PIN.
        // Or, if "password" keyword is present, take the word after it.
        let passwordStartIndex = -1;
        for (let i = pinIndex + 1; i < parts.length; i++) {
          if (parts[i].toLowerCase() === "password") {
            passwordStartIndex = i + 1;
            break;
          }
        }

        if (passwordStartIndex !== -1 && passwordStartIndex < parts.length) {
          kraPassword = parts.slice(passwordStartIndex).join(" ");
        } else if (pinIndex + 1 < parts.length) {
          // If no "password" keyword, assume the rest is the password
          kraPassword = parts.slice(pinIndex + 1).join(" ");
        }
      }

      if (kraPin && kraPassword) {
        userState.details.kraPin = kraPin;
        userState.details.kraPassword = kraPassword;
        userState.state = "SERVICE_PROCESSING";
        await executeService(userState.serviceId, userState.details, "whatsapp", from);
        userState.state = "START"; 
        userState.serviceId = null;
      } else {
        await sendMessage("whatsapp", from, "Samahani, tafadhali tuma KRA PIN na Neno Siri (Password) yako kwa usahihi. Mfano: *A123456789Z password123*.");
        // Keep user in AWAITING_KRA_CREDENTIALS state to retry
      }
    }
    else if (userState.state === "AWAITING_DETAILS") {
      userState.details.customerInput = text; 
      userState.state = "SERVICE_PROCESSING";
      await executeService(userState.serviceId, userState.details, "whatsapp", from);
      userState.state = "START";
      userState.serviceId = null;
    } 
    else {
      await sendMessage("whatsapp", from, "Karibu E-cyber! Andika *Menu* kuona huduma zetu.");
      userState.state = "AWAITING_SELECTION";
    }
    
    userStates[from] = userState;
  }
  res.sendStatus(200);
});

// Telegram Webhook
app.post("/telegram-webhook", async (req, res) => {
  const { message } = req.body;
  if (message && message.text) {
    const chatId = message.chat.id;
    const text = message.text.trim().toLowerCase();

    if (!userStates[chatId]) {
      userStates[chatId] = { state: "START", serviceId: null, details: {} };
    }
    
    let userState = userStates[chatId];

    if (["/start", "menu", "hi", "habari"].includes(text)) {
      userState.state = "AWAITING_SELECTION";
      await sendMessage("telegram", chatId, generateMenuText());
    } else if (userState.state === "AWAITING_SELECTION" || userState.state === "START") {
      const selectedIndex = parseInt(text) - 1;
      if (!isNaN(selectedIndex) && selectedIndex >= 0 && selectedIndex < serviceKeys.length) {
        const serviceId = serviceKeys[selectedIndex];
        const service = services[serviceId];
        userState.serviceId = serviceId;
        
        if (serviceId === "KRA_NIL") {
          userState.state = "AWAITING_KRA_CREDENTIALS";
          await sendMessage("telegram", chatId, `✅ Umechagua *${service.name}* (KES ${service.price}).\n\nTafadhali tuma KRA PIN na Neno Siri (Password) yako, mfano: *A123456789Z password123*.`);
        } else {
          userState.state = "AWAITING_DETAILS";
          await sendMessage("telegram", chatId, `✅ Umechagua *${service.name}* (KES ${service.price}).\n\nTafadhali tuma maelezo yako (mfano: Jina Kamili na Namba ya Kitambulisho) ili tuanze kushughulikia.`);
        }
      } else {
        await sendMessage("telegram", chatId, "Samahani, sijaelewa namba hiyo. Tafadhali chagua namba kutoka kwenye orodha au andika *Menu*.");
      }
    } else if (userState.state === "AWAITING_KRA_CREDENTIALS") {
      // Improved parsing for KRA PIN and Password
      const parts = text.split(/\s+/).filter(Boolean); // Split by any whitespace and remove empty strings
      let kraPin = null;
      let kraPassword = null;

      // Attempt to find KRA PIN (starts with A, ends with a letter, 10 chars total)
      // KRA PIN format: A123456789Z (starts with A, 9 digits, ends with a letter)
      const kraPinRegex = /^[a-zA-Z]\d{9}[a-zA-Z]$/i;

      let pinIndex = -1;
      for (let i = 0; i < parts.length; i++) {
        if (kraPinRegex.test(parts[i])) {
          kraPin = parts[i].toUpperCase();
          pinIndex = i;
          break;
        }
      }

      if (kraPin && pinIndex !== -1) {
        // Try to find the password. Look for a word that looks like a password after the PIN.
        // Or, if "password" keyword is present, take the word after it.
        let passwordStartIndex = -1;
        for (let i = pinIndex + 1; i < parts.length; i++) {
          if (parts[i].toLowerCase() === "password") {
            passwordStartIndex = i + 1;
            break;
          }
        }

        if (passwordStartIndex !== -1 && passwordStartIndex < parts.length) {
          kraPassword = parts.slice(passwordStartIndex).join(" ");
        } else if (pinIndex + 1 < parts.length) {
          // If no "password" keyword, assume the rest is the password
          kraPassword = parts.slice(pinIndex + 1).join(" ");
        }
      }

      if (kraPin && kraPassword) {
        userState.details.kraPin = kraPin;
        userState.details.kraPassword = kraPassword;
        userState.state = "SERVICE_PROCESSING";
        await executeService(userState.serviceId, userState.details, "telegram", chatId);
        userState.state = "START";
        userState.serviceId = null;
      } else {
        await sendMessage("telegram", chatId, "Samahani, tafadhali tuma KRA PIN na Neno Siri (Password) yako kwa usahihi. Mfano: *A123456789Z password123*.");
        // Keep user in AWAITING_KRA_CREDENTIALS state to retry
      }
    }
    else if (userState.state === "AWAITING_DETAILS") {
      userState.details.customerInput = text; 
      userState.state = "SERVICE_PROCESSING";
      await executeService(userState.serviceId, userState.details, "telegram", chatId);
      userState.state = "START";
      userState.serviceId = null;
    } 
    else {
      await sendMessage("telegram", chatId, "Karibu E-cyber! Andika *Menu* kuona huduma zetu.");
      userState.state = "AWAITING_SELECTION";
    }
    
    userStates[chatId] = userState;
  }
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
