const express = require("express");
const axios = require("axios");
const app = express();
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
    
    // Initialize state if not exists
    if (!userStates[from]) {
      userStates[from] = { state: "START", serviceId: null };
    }
    
    let userState = userStates[from];

    // Reset to menu if user says hi/menu
    if (["menu", "hi", "habari", "/start", "mambo"].includes(text)) {
      userState.state = "AWAITING_SELECTION";
      await sendMessage("whatsapp", from, generateMenuText());
    } 
    // Handle service selection
    else if (userState.state === "AWAITING_SELECTION" || userState.state === "START") {
      const selectedIndex = parseInt(text) - 1;
      if (!isNaN(selectedIndex) && selectedIndex >= 0 && selectedIndex < serviceKeys.length) {
        const serviceId = serviceKeys[selectedIndex];
        const service = services[serviceId];
        userState.serviceId = serviceId;
        userState.state = "AWAITING_DETAILS";
        await sendMessage("whatsapp", from, `✅ Umechagua *${service.name}* (KES ${service.price}).\n\nTafadhali tuma maelezo yako (mfano: Jina Kamili na Namba ya Kitambulisho) ili tuanze kushughulikia.`);
      } else {
        await sendMessage("whatsapp", from, "Samahani, sijaelewa namba hiyo. Tafadhali chagua namba kutoka kwenye orodha au andika *Menu*.");
      }
    } 
    // Handle detail submission
    else if (userState.state === "AWAITING_DETAILS") {
      const service = services[userState.serviceId];
      await sendMessage("whatsapp", from, `Asante! Tumepokea maelezo yako kwa ajili ya *${service.name}*. Tunashughulikia sasa na tutakujulisha punde.`);
      userState.state = "START"; // Reset after completion
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
      userStates[chatId] = { state: "START", serviceId: null };
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
        userState.state = "AWAITING_DETAILS";
        await sendMessage("telegram", chatId, `✅ Umechagua *${service.name}* (KES ${service.price}).\n\nTafadhali tuma maelezo yako (mfano: Jina Kamili na Namba ya Kitambulisho) ili tuanze kushughulikia.`);
      } else {
        await sendMessage("telegram", chatId, "Samahani, sijaelewa namba hiyo. Tafadhali chagua namba kutoka kwenye orodha au andika *Menu*.");
      }
    } else if (userState.state === "AWAITING_DETAILS") {
      const service = services[userState.serviceId];
      await sendMessage("telegram", chatId, `Asante! Tumepokea maelezo yako kwa ajili ya *${service.name}*. Tunashughulikia sasa na tutakujulisha punde.`);
      userState.state = "START";
      userState.serviceId = null;
    } else {
      await sendMessage("telegram", chatId, "Karibu E-cyber! Andika *Menu* kuona huduma zetu.");
      userState.state = "AWAITING_SELECTION";
    }
    
    userStates[chatId] = userState;
  }
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
