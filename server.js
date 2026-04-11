const express = require('express');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const IntaSend = require('intasend-node');
require('dotenv').config();

const app = express();
app.use(express.json());

// Credentials
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const INTASEND_PUBLIC = process.env.INTASEND_PUBLIC_KEY;
const INTASEND_SECRET = process.env.INTASEND_SECRET_KEY;

// Initialize Bots
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const intasend = new IntaSend(INTASEND_PUBLIC, INTASEND_SECRET, false); // false for live

// Service Menu
const services = [
  { id: 1, name: "KRA NIL Returns", price: 50, keyword: "nil" },
  { id: 2, name: "KRA Individual Returns", price: 300, keyword: "individual" },
  { id: 3, name: "KRA PIN Retrieval", price: 100, keyword: "pin" },
  { id: 4, name: "KRA Tax Compliance", price: 250, keyword: "compliance" },
  { id: 5, name: "NHIF Registration", price: 150, keyword: "nhif" },
  { id: 6, name: "NSSF Registration", price: 150, keyword: "nssf" },
  { id: 7, name: "Business Name Search", price: 200, keyword: "search" },
  { id: 8, name: "Business Registration", price: 1000, keyword: "registration" },
  { id: 9, name: "eCitizen Account", price: 100, keyword: "ecitizen" },
  { id: 10, name: "Certificate Search", price: 200, keyword: "certificate" }
];

const userState = {};

// --- STK PUSH FUNCTION ---
async function sendSTKPush(phone, amount, serviceName) {
  try {
    const cleanPhone = phone.startsWith('0') ? '254' + phone.substring(1) : phone;
    const response = await intasend.collection().mpesaStkPush({
      phone_number: cleanPhone,
      amount: amount,
      currency: 'KES',
      api_ref: `Pay-${serviceName}`,
      narrative: `Payment for ${serviceName}`
    });
    return response;
  } catch (e) {
    console.error("STK Error:", e);
    return null;
  }
}

// --- TELEGRAM LOGIC ---
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text ? msg.text.toLowerCase() : '';

  if (text === '/start' || text === 'hi' || text === 'menu') {
    let menu = "🏛️ *E-cyber Universal Services*\n\n";
    services.forEach(s => menu += `${s.id}. ${s.name} - KES ${s.price}\n`);
    menu += "\nReply with the *Service Name* to start!";
    bot.sendMessage(chatId, menu, { parse_mode: 'Markdown' });
  } else {
    const service = services.find(s => text.includes(s.keyword));
    if (service) {
      userState[chatId] = { service: service };
      bot.sendMessage(chatId, `You selected *${service.name}*. Please send your M-Pesa number for STK Push (e.g., 0712345678):`, { parse_mode: 'Markdown' });
    } else if (userState[chatId] && /^\d{10,12}$/.test(text)) {
      const s = userState[chatId].service;
      bot.sendMessage(chatId, `🚀 Sending STK Push of KES ${s.price} to ${text}...`);
      const res = await sendSTKPush(text, s.price, s.name);
      if (res) bot.sendMessage(chatId, "✅ Check your phone for the M-Pesa PIN prompt!");
      delete userState[chatId];
    }
  }
});

// WhatsApp & Webhook logic remains same but uses 'services' array for menu
app.get('/', (req, res) => res.send("E-cyber Universal Engine is Live with 10 Services!"));
app.listen(process.env.PORT || 3000);
