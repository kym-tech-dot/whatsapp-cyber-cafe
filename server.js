const express = require('express');
const axios = require('axios');
const fs = require('fs');
const app = express();
app.use(express.json());

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Load Services
let services = {};
try {
  if (fs.existsSync('./services.json')) {
    services = JSON.parse(fs.readFileSync('./services.json', 'utf8'));
  }
} catch (error) { console.error('Error loading services:', error.message); }

// Simple in-memory state (Resets on server restart)
const userStates = {};

async function sendMessage(platform, to, text) {
  try {
    if (platform === 'whatsapp') {
      await axios.post(`https://graph.facebook.com/v17.0/${PHONE_ID}/messages`, {
        messaging_product: 'whatsapp', to: to, type: 'text', text: { body: text }
      }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } } );
    } else if (platform === 'telegram') {
      await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, { chat_id: to, text: text, parse_mode: 'Markdown' } );
    }
  } catch (e) { console.error('Error sending message:', e.message); }
}

const menuText = "🏛️ *E-cyber Assistant Menu*\n\nChagua huduma kwa kuandika namba:\n1. KRA NIL Returns\n2. SHA Registration\n3. Good Conduct\n4. DL Renewal\n5. Business Name Search\n6. HELB Application\n7. KRA PIN Registration\n8. Passport Application\n9. Logbook Transfer\n10. ID Replacement\n\nAndika namba ya huduma unayotaka!";

app.get('/', (req, res) => res.send('E-cyber Smart Assistant is Live! 🚀'));

// WhatsApp Webhook
app.get('/webhook', (req, res) => {
  if (req.query['hub.verify_token'] === VERIFY_TOKEN) res.send(req.query['hub.challenge']);
  else res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  const body = req.body;
  const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (message) {
    const from = message.from;
    const text = message.text.body.trim().toLowerCase();
    
    // Logic ya kutoa huduma kulingana na namba
    const serviceKeys = Object.keys(services);
    const selectedIndex = parseInt(text) - 1;

    if (text === 'menu' || text === 'hi' || text === 'habari') {
      await sendMessage('whatsapp', from, menuText);
    } else if (!isNaN(selectedIndex) && selectedIndex >= 0 && selectedIndex < serviceKeys.length) {
      const service = services[serviceKeys[selectedIndex]];
      await sendMessage('whatsapp', from, `✅ Huduma ya *${service.name}* imepokelewa!\n\nGharama: KES ${service.price}.\n\nTunashughulikia maombi yako sasa. Tafadhali subiri maelekezo zaidi.`);
    } else {
      await sendMessage('whatsapp', from, "Samahani, sijaelewa. Andika *Menu* kuona huduma zetu.");
    }
  }
  res.sendStatus(200);
});

// Telegram Webhook
app.post('/telegram-webhook', async (req, res) => {
  const { message } = req.body;
  if (message && message.text) {
    const chatId = message.chat.id;
    const text = message.text.trim().toLowerCase();

    const serviceKeys = Object.keys(services);
    const selectedIndex = parseInt(text) - 1;

    if (text === '/start' || text === 'menu' || text === 'hi') {
      await sendMessage('telegram', chatId, menuText);
    } else if (!isNaN(selectedIndex) && selectedIndex >= 0 && selectedIndex < serviceKeys.length) {
      const service = services[serviceKeys[selectedIndex]];
      await sendMessage('telegram', chatId, `✅ Huduma ya *${service.name}* imepokelewa!\n\nGharama: KES ${service.price}.\n\nTunashughulikia maombi yako sasa.`);
    } else {
      await sendMessage('telegram', chatId, "Samahani, sijaelewa. Andika *Menu* kuona huduma zetu.");
    }
  }
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
