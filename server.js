const express = require('express');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const app = express();
app.use(express.json());

// Load Credentials
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Initialize Telegram Bot
const bot = new TelegramBot(TELEGRAM_TOKEN, {polling: true});

// --- TELEGRAM LOGIC ---
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text ? msg.text.toLowerCase() : '';

  if (text === '/start' || text === 'hi' || text === 'menu') {
    const welcome = "🏛️ *Welcome to E-cyber Assistant*\n\nHow can I help you today?\n1. KRA NIL Returns (KES 50)\n2. eCitizen Services\n3. CV Generation\n\nType *KRA* to get started!";
    bot.sendMessage(chatId, welcome, {parse_mode: 'Markdown'});
  } else if (text.includes('kra')) {
    bot.sendMessage(chatId, "To file your KRA NIL Returns, please pay KES 50. (Payment link integration coming soon!)");
  }
});

// --- WHATSAPP LOGIC ---
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  const body = req.body;
  if (body.object === 'whatsapp_business_account') {
    const entry = body.entry[0];
    const changes = entry.changes[0];
    const value = changes.value;
    if (value.messages) {
      const message = value.messages[0];
      const from = message.from;
      const text = message.text?.body || '';
      
      if (text.toLowerCase() === 'hi' || text.toLowerCase() === 'menu') {
        await sendMessage(from, "🏛️ *Welcome to E-cyber Assistant*\n\n1. KRA NIL Returns (KES 50)\n2. eCitizen Services\n\nType *KRA* to start!");
      }
    }
  }
  res.sendStatus(200);
});

async function sendMessage(to, text) {
  try {
    await axios.post(`https://graph.facebook.com/v17.0/${PHONE_ID}/messages`, {
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: { body: text }
    }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } } );
  } catch (e) { console.error('WA Error', e.response?.data); }
}

// --- LEGAL ENDPOINTS (For Meta Review) ---
app.get('/privacy', (req, res) => res.send("Privacy Policy: We protect your data."));
app.get('/terms', (req, res) => res.send("Terms of Service: Use our bot fairly."));
app.get('/', (req, res) => res.send("E-cyber Universal Engine is Live!"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
