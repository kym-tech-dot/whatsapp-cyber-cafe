const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// Hizi zinatoka kwenye Render Environment Variables
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const INTASEND_PUBLIC = process.env.INTASEND_PUBLIC_KEY;
const INTASEND_SECRET = process.env.INTASEND_SECRET_KEY;

// 1. WhatsApp Webhook Verification
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

// 2. Handle Incoming WhatsApp Messages
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

      if (text.toLowerCase() === 'menu' || text.toLowerCase() === 'hi') {
        await sendMessage(from, "🏛️ *Cyber Café Services*\n\n1. KRA NIL Returns (KES 50)\n2. eCitizen Services\n3. CV Generation\n\nType *KRA* to file your returns!");
      } else if (text.toLowerCase().includes('kra')) {
        const paymentLink = await createIntaSendPayment(from, 50, 'KRA NIL Returns');
        await sendMessage(from, `To file your KRA NIL Returns, please pay KES 50 via M-Pesa here: ${paymentLink}\n\nOnce paid, I will start the automation!`);
      }
    }
  }
  res.sendStatus(200);
});

async function createIntaSendPayment(phone, amount, serviceName) {
  try {
    const response = await axios.post('https://payment.intasend.com/api/v1/checkout/', {
      public_key: INTASEND_PUBLIC,
      amount: amount,
      currency: 'KES',
      email: 'customer@example.com',
      first_name: 'Customer',
      last_name: phone,
      host: 'https://whatsapp-cyber-cafe.onrender.com'
    }, { headers: { Authorization: 'Bearer ' + INTASEND_SECRET } }  );
    return response.data.url;
  } catch (error) { return 'Error generating payment link.'; }
}

async function sendMessage(to, text) {
  try {
    await axios.post(`https://graph.facebook.com/v17.0/${PHONE_ID}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'text',
      text: { body: text }
    }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' } }  );
  } catch (error) { console.error('WhatsApp Error:', error.response?.data); }
}

app.post('/intasend-webhook', async (req, res) => {
  const data = req.body;
  if (data.state === 'COMPLETE') {
    const phone = data.customer.last_name; 
    await sendMessage(phone, "✅ Payment Received! I am now starting your KRA NIL Returns automation. Please wait...");
  }
  res.sendStatus(200);
});

app.get('/', (req, res) => res.send('Cyber Cafe Bot is Live!'));

// Hii ni muhimu kwa Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
