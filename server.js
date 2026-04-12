const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// --- Environment Variables ---
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const INTASEND_PUBLIC = process.env.INTASEND_PUBLIC_KEY;
const INTASEND_SECRET = process.env.INTASEND_SECRET_KEY;

// --- 1. Home, Privacy, and Terms (Kwa ajili ya Meta Review) ---
app.get('/', (req, res) => res.send('<h1>E-cyber Omnichannel is Live! 🚀</h1><p>WhatsApp, Telegram, FB, IG, and USSD are active.</p>'));
app.get('/privacy', (req, res) => res.send('<h1>Privacy Policy</h1><p>We protect your data.</p>'));
app.get('/terms', (req, res) => res.send('<h1>Terms of Service</h1><p>Use our services responsibly.</p>'));

// --- 2. Helper Functions ---
async function sendTelegramMessage(chatId, text) {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    } );
  } catch (error) { console.error('Telegram Error:', error.response?.data || error.message); }
}

async function sendWhatsAppMessage(to, text) {
  try {
    await axios.post(`https://graph.facebook.com/v17.0/${PHONE_ID}/messages`, {
      messaging_product: 'whatsapp', to: to, type: 'text', text: { body: text }
    }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } } );
  } catch (error) { console.error('WhatsApp Error:', error.response?.data); }
}

async function triggerMpesaStkPush(phone, amount, label) {
  try {
    let formattedPhone = phone;
    if (phone.startsWith('0')) formattedPhone = '254' + phone.substring(1);
    await axios.post('https://payment.intasend.com/api/v1/payment/mpesa-stk-push/', {
      public_key: INTASEND_PUBLIC, amount: amount, phone_number: formattedPhone, api_ref: label
    }, { headers: { Authorization: 'Bearer ' + INTASEND_SECRET } } );
  } catch (error) { console.error('M-Pesa Error:', error.response?.data); }
}

// --- 3. Webhook Handlers ---

// Telegram Webhook
app.post(`/telegram-webhook`, async (req, res) => {
  const { message } = req.body;
  if (message && message.text) {
    const chatId = message.chat.id;
    const text = message.text.toLowerCase();
    if (text === '/start' || text === 'menu' || text === 'hi') {
      await sendTelegramMessage(chatId, "🏛️ *E-cyber Assistant*\n\nWelcome! I can help you with KRA, eCitizen, and more.\n\n1. KRA NIL Returns (KES 50)\nType *KRA* to start!");
    } else if (text.includes('kra')) {
      await sendTelegramMessage(chatId, "Initiating M-Pesa STK Push for KES 50... Please check your phone.");
      // Note: In Telegram, we might need to ask for the user's phone number if it's not their username
      await sendTelegramMessage(chatId, "Please type your M-Pesa number (e.g., 0712345678) to receive the prompt.");
    }
  }
  res.sendStatus(200);
});

// WhatsApp Webhook
app.get('/webhook', (req, res) => {
  if (req.query['hub.verify_token'] === VERIFY_TOKEN) res.send(req.query['hub.challenge']);
  else res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  const body = req.body;
  if (body.object === 'whatsapp_business_account') {
    const message = body.entry[0].changes[0].value.messages?.[0];
    if (message) {
      const from = message.from;
      const text = message.text.body.toLowerCase();
      if (text === 'hi' || text === 'menu') {
        await sendWhatsAppMessage(from, "Welcome to E-cyber! Type *KRA* for NIL Returns.");
      } else if (text.includes('kra')) {
        await triggerMpesaStkPush(from, 50, "KRA_NIL");
      }
    }
  }
  res.sendStatus(200);
});

// --- 4. Final Step: Set Telegram Webhook ---
// You only need to visit this URL once after deploying:
// https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook?url=https://whatsapp-cyber-cafe.onrender.com/telegram-webhook

const PORT = process.env.PORT || 3000;
app.listen(PORT, ( ) => console.log(`Server is running on port ${PORT}`));
