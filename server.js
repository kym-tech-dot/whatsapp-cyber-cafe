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
const userStates = {}; // { userId: { state: 'awaiting_service_selection', serviceId: null, details: {} } }

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
    
    let userState = userStates[from] || { state: 'awaiting_service_selection', serviceId: null, details: {} };

    if (text === 'menu' || text === 'hi' || text === 'habari' || text === '/start') {
      userState = { state: 'awaiting_service_selection', serviceId: null, details: {} };
      await sendMessage('whatsapp', from, generateMenuText());
    } else if (userState.state === 'awaiting_service_selection') {
      const selectedIndex = parseInt(text) - 1;
      if (!isNaN(selectedIndex) && selectedIndex >= 0 && selectedIndex < serviceKeys.length) {
        const serviceId = serviceKeys[selectedIndex];
        const service = services[serviceId];
        userState.serviceId = serviceId;
        userState.state = 'awaiting_service_details';
        userStates[from] = userState;
        await sendMessage('whatsapp', from, `✅ Umechagua *${service.name}* (KES ${service.price}).\n\nIli kuendelea, tafadhali toa taarifa zifuatazo (mfano: Jina Kamili, Namba ya Kitambulisho, n.k. kulingana na huduma):`);
      } else {
        await sendMessage('whatsapp', from, "Samahani, sijaelewa. Andika *Menu* kuona huduma zetu au chagua namba sahihi.");
      }
    } else if (userState.state === 'awaiting_service_details') {
      const service = services[userState.serviceId];
      // Here, you would process the details provided by the user for the selected service.
      // For now, we'll just acknowledge and reset the state.
      userState.details.input = text; // Store the user's input
      userState.state = 'service_processing';
      userStates[from] = userState;
      await sendMessage('whatsapp', from, `Asante! Tumepokea maelezo yako kwa ajili ya huduma ya *${service.name}*. Tunashughulikia maombi yako sasa na tutakujulisha punde. Asante kwa kutumia E-cyber!`);
      // Reset state after 
kazi.
      userStates[from] = { state: 'awaiting_service_selection', serviceId: null, details: {} }; // Reset state
    } else {
      await sendMessage('whatsapp', from, "Samahani, sijaelewa. Andika *Menu* kuona huduma zetu.");
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

    let userState = userStates[chatId] || { state: 'awaiting_service_selection', serviceId: null, details: {} };

    if (text === '/start' || text === 'menu' || text === 'hi') {
      userState = { state: 'awaiting_service_selection', serviceId: null, details: {} };
      await sendMessage('telegram', chatId, generateMenuText());
    } else if (userState.state === 'awaiting_service_selection') {
      const selectedIndex = parseInt(text) - 1;
      if (!isNaN(selectedIndex) && selectedIndex >= 0 && selectedIndex < serviceKeys.length) {
        const serviceId = serviceKeys[selectedIndex];
        const service = services[serviceId];
        userState.serviceId = serviceId;
        userState.state = 'awaiting_service_details';
        userStates[chatId] = userState;
        await sendMessage('telegram', chatId, `✅ Umechagua *${service.name}* (KES ${service.price}).\n\nIli kuendelea, tafadhali toa taarifa zifuatazo (mfano: Jina Kamili, Namba ya Kitambulisho, n.k. kulingana na huduma):`);
      } else {
        await sendMessage('telegram', chatId, "Samahani, sijaelewa. Andika *Menu* kuona huduma zetu au chagua namba sahihi.");
      }
    } else if (userState.state === 'awaiting_service_details') {
      const service = services[userState.serviceId];
      // Here, you would process the details provided by the user for the selected service.
      // For now, we'll just acknowledge and reset the state.
      userState.details.input = text; // Store the user's input
      userState.state = 'service_processing';
      userStates[chatId] = userState;
      await sendMessage('telegram', chatId, `Asante! Tumepokea maelezo yako kwa ajili ya huduma ya *${service.name}*. Tunashughulikia maombi yako sasa na tutakujulisha punde. Asante kwa kutumia E-cyber!`);
      userStates[chatId] = { state: 'awaiting_service_selection', serviceId: null, details: {} }; // Reset state
    } else {
      await sendMessage('telegram', chatId, "Samahani, sijaelewa. Andika *Menu* kuona huduma zetu.");
    }
    userStates[chatId] = userState;
  }
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
