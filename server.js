const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// Environment Variables kutoka Render
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

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

// 2. Kurasa za Kisheria kwa ajili ya Meta (Privacy & Terms)
app.get('/privacy', (req, res) => {
  res.send('<h1>Privacy Policy</h1><p>E-cyber bot is committed to protecting your personal data. We only collect information necessary to provide cyber cafe services like KRA returns. Your data is never shared with third parties.</p>');
});

app.get('/terms', (req, res) => {
  res.send('<h1>Terms of Service</h1><p>By using E-cyber bot, you agree to our terms. We provide automated assistance for government services. Users are responsible for the accuracy of the data provided.</p>');
});

// 3. Ukurasa wa Nyumbani (Home Page)
app.get('/', (req, res) => {
  res.send('<h1>E-cyber Universal Engine is Live!</h1><p>Official website for E-cyber bot services.</p>');
});

// 4. Handle Incoming WhatsApp Messages
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
      console.log(`Meseji kutoka ${from}: ${text}`);
      // Hapa unaweza kuongeza logic yako ya AI au Menu
    }
  }
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
