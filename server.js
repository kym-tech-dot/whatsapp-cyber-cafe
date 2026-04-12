const express = require('express');
const axios = require('axios');
const fs = require('fs');
const app = express();
app.use(express.json());

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

let services = {};
try {
  if (fs.existsSync('./services.json')) {
    services = JSON.parse(fs.readFileSync('./services.json', 'utf8'));
  }
} catch (error) { console.error('Error loading services:', error.message); }

async function sendMessage(platform, to, text) {
  try {
    if (platform === 'whatsapp') {
      await axios.post(`https://graph.facebook.com/v17.0/${PHONE_ID}/messages`, {
        messaging_product: 'whatsapp', to: to, type: 'text', text: { body: text }
      }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } } );
    } else if (platform === 'telegram') {
      await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, { chat_id: to, text: text } );
    }
  } catch (e) { console.error('Error sending message:', e.message); }
}

app.get('/', (req, res) => res.send('E-cyber Universal (Bypass Mode) is Live! 🚀'));

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
    const text = message.text.body.toLowerCase();
    
    let foundService = null;
    for (const key in services) {
      if (services[key].keywords.some(k => text.includes(k))) {
        foundService = services[key];
        break;
      }
    }

    if (foundService) {
      await sendMessage('whatsapp', from, `✅ Huduma ya *${foundService.name}* imepokelewa!\n\nGharama ni KES ${foundService.price}. Tunashughulikia maombi yako sasa, tutakujulisha punde.`);
    } else {
      await sendMessage('whatsapp', from, "Karibu E-cyber! Andika huduma unayotaka (mfano: KRA, SHA, NTSA) au 'Menu'.");
    }
  }
  res.sendStatus(200);
});

// Telegram Webhook
app.post('/telegram-webhook', async (req, res) => {
  const { message } = req.body;
  if (message && message.text) {
    const chatId = message.chat.id;
    const text = message.text.toLowerCase();

    let foundService = null;
    for (const key in services) {
      if (services[key].keywords.some(k => text.includes(k))) {
        foundService = services[key];
        break;
      }
    }

    if (foundService) {
      await sendMessage('telegram', chatId, `✅ Huduma ya *${foundService.name}* imepokelewa!\n\nGharama ni KES ${foundService.price}. Tunashughulikia maombi yako sasa.`);
    } else {
      await sendMessage('telegram', chatId, "Karibu E-cyber! Andika huduma unayotaka (mfano: KRA, SHA, NTSA).");
    }
  }
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));

