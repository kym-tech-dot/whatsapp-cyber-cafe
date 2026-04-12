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
let serviceKeys = [];
try {
  if (fs.existsSync('./services.json')) {
    services = JSON.parse(fs.readFileSync('./services.json', 'utf8'));
    serviceKeys = Object.keys(services);
  }
} catch (error) { console.error('Error loading services:', error.message); }

// Simple in-memory state for users (resets on server restart)
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

function generateMenuText() {
  let menu = "🏛️ *E-cyber Assistant Menu*\n\nChagua huduma kwa kuandika namba:\n";
  serviceKeys.forEach((key, index) => {
    menu += `${index + 1}. ${services[key].name}\n`;
  });
  menu += "\nAndika namba ya huduma unayotaka!";
  return menu;
}

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
    
    // Initialize state if not exists
    if (!userStates[from]) {
      userStates[from] = { state: 'START', serviceId: null };
    }
    
    let userState = userStates[from];

    // Reset to menu if user says hi/menu
    if (['menu', 'hi', 'habari', '/start', 'mambo'].includes(text)) {
      userState.state = 'AWAITING_SELECTION';
      await sendMessage('whatsapp', from, generateMenuText());
    } 
    // Handle service selection
    else if (userState.state === 'AWAITING_SELECTION' || userState.state === 'START') {
      const selectedIndex = parseInt(text) - 1;
      if (!isNaN(selectedIndex) && selectedIndex >= 0 && selectedIndex < serviceKeys.length) {
        const serviceId = serviceKeys[selectedIndex];
        const service = services[serviceId];
        userState.serviceId = serviceId;
        userState.state = 'AWAITING_DETAILS';
        await sendMessage('whatsapp', from, `✅ Umechagua *${service.name}* (KES ${service.price}).\n\nTafadhali tuma maelezo yako (mfano: Jina Kamili na Namba ya Kitambulisho) ili tuanze kushughulikia.`);
      } else {
        await sendMessage('whatsapp', from, "Samahani, sijaelewa namba hiyo. Tafadhali chagua namba kutoka kwenye orodha au andika *Menu*.");
      }
    } 
    // Handle detail submission
    else if (userState.state === 'AWAITING_DETAILS') {
      const service = services[userState.serviceId];
      await sendMessage('whatsapp', from, `Asante! Tumepokea maelezo yako kwa ajili ya *${service.name}*. Tunashughulikia sasa na tutakujulisha punde.`);
      userState.state = 'START'; // Reset after completion
      userState.serviceId = null;
    } 
    else {
      await sendMessage('whatsapp', from, "Karibu E-cyber! Andika *Menu* kuona huduma zetu.");
      userState.state = 'AWAITING_SELECTION';
    }
    
    userStates[from] = userState;
  }
  res.sendStatus(200);
});

// Telegram Webhook
app.post('/telegram-webhook', async (req, res) => {
  const { message } = req.body;
  if (message && message.text) {
    const chatId = message.chat.id;
    const text = message.text.trim().toLowerCase();

    if (!userStates[chatId]) {
      userStates[chatId] = { state: 'START', serviceId: null };
    }
    
    let userState = userStates[chatId];

    if (['/start', 'menu', 'hi', 'habari'].includes(text)) {
      userState.state = 'AWAITING_SELECTION';
      await sendMessage('telegram', chatId, generateMenuText());
    } else if (userState.state === 'AWAITING_SELECTION' || userState.state === 'START') {
      const selectedIndex = parseInt(text) - 1;
      if (!isNaN(selectedIndex) && selectedIndex >= 0 && selectedIndex < serviceKeys.length) {
        const serviceId = serviceKeys[selectedIndex];
        const service = services[serviceId];
        userState.serviceId = serviceId;
        userState.state = 'AWAITING_DETAILS';
        await sendMessage('telegram', chatId, `✅ Umechagua *${service.name}* (KES ${service.price}).\n\nTafadhali tuma maelezo yako (mfano: Jina Kamili na Namba ya Kitambulisho) ili tuanze kushughulikia.`);
      } else {
        await sendMessage('telegram', chatId, "Samahani, sijaelewa namba hiyo. Tafadhali chagua namba kutoka kwenye orodha au andika *Menu*.");
      }
    } else if (userState.state === 'AWAITING_DETAILS') {
      const service = services[userState.serviceId];
      await sendMessage('telegram', chatId, `Asante! Tumepokea maelezo yako kwa ajili ya *${service.name}*. Tunashughulikia sasa na tutakujulisha punde.`);
      userState.state = 'START';
      userState.serviceId = null;
    } else {
      await sendMessage('telegram', chatId, "Karibu E-cyber! Andika *Menu* kuona huduma zetu.");
      userState.state = 'AWAITING_SELECTION';
    }
    
    userStates[chatId] = userState;
  }
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
