require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

// --- CONFIGURATION ---
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PORT = process.env.PORT || 10000; // Render uses 10000 by default

// Initialize Telegram Bot
const telegramBot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// --- 10 CYBER SERVICES & PRICING ---
const services = [
  { id: "kra_nil", name: "KRA NIL Returns", price: 50 },
  { id: "kra_ind", name: "KRA Individual Returns", price: 300 },
  { id: "kra_pin", name: "KRA PIN Retrieval", price: 100 },
  { id: "kra_tcc", name: "KRA Tax Compliance Cert.", price: 250 },
  { id: "nhif_reg", name: "NHIF Self-Registration", price: 150 },
  { id: "nssf_reg", name: "NSSF Self-Registration", price: 150 },
  { id: "biz_search", name: "Business Name Search", price: 200 },
  { id: "biz_reg", name: "Business Name Registration", price: 1000 },
  { id: "ecitizen_acc", name: "ECitizen Account Creation", price: 100 },
  { id: "cert_search", name: "Academic Certificate Search", price: 200 },
];

// --- ROOT ROUTE (Fixes "Cannot GET /") ---
app.get("/", (req, res) => {
  res.status(200).send("<h1>E-cyber Assistant is LIVE! 🚀</h1><p>Bot is running and ready for Telegram & WhatsApp.</p>");
});

// --- TELEGRAM LOGIC ---
const showTelegramMenu = (chatId) => {
  const inlineKeyboard = services.map((s) => [
    { text: `${s.name} - KES ${s.price}`, callback_data: `srv_${s.id}` },
  ]);
  telegramBot.sendMessage(chatId, "🏛️ *Welcome to E-cyber Assistant*\n\nSelect a service to get started:", {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: inlineKeyboard },
  });
};

telegramBot.onText(/\/start/, (msg) => showTelegramMenu(msg.chat.id));

telegramBot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  telegramBot.answerCallbackQuery(query.id);

  if (data.startsWith("srv_")) {
    const serviceId = data.replace("srv_", "");
    const service = services.find((s) => s.id === serviceId);

    if (service) {
      // --- SKIP PAYMENT LOGIC ---
      telegramBot.sendMessage(chatId, `✅ Malipo ya KES ${service.price} yamepokelewa! (Test Mode)\n\nNaanza kufanya automation ya *${service.name}* sasa hivi...`, { parse_mode: "Markdown" });
      
      // Automation logic would be triggered here
      console.log(`Starting automation for ${service.name} on Telegram...`);
    }
  }
});

// --- WHATSAPP LOGIC ---
const sendWhatsAppMessage = async (to, text) => {
  try {
    await axios.post(`https://graph.facebook.com/v17.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
  } catch (e) { console.error("WhatsApp Error:", e.response?.data || e.message); }
};

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.object === "whatsapp_business_account") {
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (message) {
      const from = message.from;
      const text = message.text?.body?.toLowerCase();

      if (text === "hi" || text === "menu" || text === "start") {
        let menuText = "🏛️ *Welcome to E-cyber Assistant*\n\nReply with the number of the service you need:\n\n";
        services.forEach((s, i) => { menuText += `${i + 1}. ${s.name} (KES ${s.price})\n`; });
        await sendWhatsAppMessage(from, menuText);
      } else {
        const index = parseInt(text) - 1;
        if (services[index]) {
          const service = services[index];
          // --- SKIP PAYMENT LOGIC ---
          await sendWhatsAppMessage(from, `✅ Malipo ya KES ${service.price} yamepokelewa! (Test Mode)\n\nNaanza kufanya automation ya *${service.name}* sasa hivi...`);
          console.log(`Starting automation for ${service.name} on WhatsApp...`);
        }
      }
    }
  }
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) res.status(200).send(challenge);
  else res.sendStatus(403);
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log("E-cyber Assistant is LIVE (Skip Payment Mode)");
});

