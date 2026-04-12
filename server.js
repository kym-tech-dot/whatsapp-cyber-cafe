const express = require('express');
const axios = require('axios');
const OpenAI = require('openai');
const fs = require('fs');

const app = express();
app.use(express.json());

// Load Environment Variables
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const INTASEND_PUBLIC = process.env.INTASEND_PUBLIC_KEY;
const INTASEND_SECRET = process.env.INTASEND_SECRET_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Initialize AI Client
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Load Universal Service Database (1,000+ services)
// In production, this would be a MongoDB or similar database
let services = {};
try {
  services = JSON.parse(fs.readFileSync('./services.json', 'utf8'));
} catch (error) {
  console.error('Error loading services.json:', error.message);
}

// In-memory state management (Replace with Redis/MongoDB for 10k users/hr)
const userStates = {};

// --- Helper Functions ---

async function sendMessage(to, text) {
  try {
    await axios.post(`https://graph.facebook.com/v17.0/${PHONE_ID}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'text',
      text: { body: text }
    }, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('WhatsApp Error:', error.response?.data || error.message);
  }
}

async function triggerMpesaStkPush(phone, amount, serviceKey) {
  try {
    let formattedPhone = phone;
    if (phone.startsWith('0')) formattedPhone = '254' + phone.substring(1);
    if (phone.startsWith('+')) formattedPhone = phone.substring(1);

    const response = await axios.post('https://payment.intasend.com/api/v1/payment/mpesa-stk-push/', {
      public_key: INTASEND_PUBLIC,
      amount: amount,
      phone_number: formattedPhone,
      email: 'customer@example.com',
      api_ref: serviceKey
    }, {
      headers: { Authorization: 'Bearer ' + INTASEND_SECRET }
    });
    return response.data;
  } catch (error) {
    console.error('M-Pesa STK Push Error:', error.response?.data || error.message);
    return null;
  }
}

async function handleAIIntent(messageText) {
  try {
    const serviceList = Object.keys(services).map(key => `${key}: ${services[key].keywords.join(', ')}`).join('\n');
    
    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { "role": "system", "content": `You are the E-cyber Router. Your task is to identify which service the user wants from the list below. If you find a match, return ONLY the service key (e.g., 'KRA_NIL'). If you don't find a clear match, return 'NONE'.

Services List:
${serviceList}` },
        { "role": "user", "content": messageText }
      ],
    });
    return chatCompletion.choices[0].message.content.trim();
  } catch (error) {
    return 'NONE';
  }
}

async function handleAIGeneralResponse(messageText) {
  try {
    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { "role": "system", "content": "You are the E-cyber Assistant, an expert in Kenyan government services (KRA, eCitizen, NTSA, HELB). Answer customer questions politely and guide them to type 'Menu' to see available automated services. Use Kenyan English/Sheng where appropriate. Keep it brief." },
        { "role": "user", "content": messageText }
      ],
    });
    return chatCompletion.choices[0].message.content;
  } catch (error) {
    return "Pole, I'm having trouble thinking right now. Please try again later.";
  }
}

// --- Webhook Handlers ---

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
      const messageText = message.text?.body || '';

      console.log(`Meseji kutoka ${from}: ${messageText}`);

      // 1. Check if user is in the middle of a flow
      if (userStates[from]) {
        // Handle data collection logic here...
        // For now, let's keep it simple for the user to initiate a new service.
      }

      // 2. Handle standard menu
      if (messageText.toLowerCase() === 'menu' || messageText.toLowerCase() === 'hi') {
        let menuText = "🏛️ *E-cyber Universal Portal*\n\nNatafuta huduma gani leo? Hapa kuna baadhi ya huduma zetu:\n\n";
        Object.keys(services).slice(0, 5).forEach(key => {
          menuText += `• *${services[key].name}* (KES ${services[key].price})\n`;
        });
        menuText += "\nType a service name or ask me anything!";
        await sendMessage(from, menuText);
        res.sendStatus(200); return;
      }

      // 3. AI Intent Discovery (Find service from 1,000+ list)
      const serviceKey = await handleAIIntent(messageText);
      
      if (serviceKey !== 'NONE' && services[serviceKey]) {
        const service = services[serviceKey];
        await sendMessage(from, `Huduma ya *${service.name}* inagharimu KES ${service.price}. Nitakutumia M-Pesa STK Push sasa hivi. Tafadhali weka PIN yako.`);
        
        const stkResult = await triggerMpesaStkPush(from, service.price, serviceKey);
        if (!stkResult || stkResult.status !== 'success') {
          await sendMessage(from, "Samahani, imeshindikana kutuma M-Pesa prompt. Tafadhali jaribu tena baadae.");
        }
      } else {
        // 4. General AI Assistant for inquiries
        const aiResponse = await handleAIGeneralResponse(messageText);
        await sendMessage(from, aiResponse);
      }
    }
  }
  res.sendStatus(200);
});

app.post('/intasend-webhook', async (req, res) => {
  const data = req.body;
  if (data.state === 'COMPLETE') {
    const phone = data.customer.last_name;
    const serviceKey = data.api_ref;
    const service = services[serviceKey];

    if (service) {
      await sendMessage(phone, `✅ Malipo ya KES ${data.amount} yamepokelewa kwa ajili ya *${service.name}*!`);
      await sendMessage(phone, `Mahitaji ya huduma hii ni: ${service.requirements.join(', ')}. Nitakujulisha hatua inayofuata sasa hivi.`);
      // Start automated processing...
    }
  }
  res.sendStatus(200);
});

app.get('/', (req, res) => res.send('E-cyber Universal Engine is Live!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
