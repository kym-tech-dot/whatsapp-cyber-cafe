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
const INTASEND_PUBLIC = process.env.INTASEND_PUBLIC_KEY;
const INTASEND_SECRET = process.env.INTASEND_SECRET_KEY;

// Initialize Telegram Bot
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// --- SERVICE DEFINITIONS ---
const services = {
  'kra nil returns': { name: 'KRA NIL Returns', price: 50, keyword: 'kra nil' },
  'kra individual returns': { name: 'KRA Individual Returns', price: 300, keyword: 'kra individual' },
  'kra pin retrieval': { name: 'KRA PIN Retrieval', price: 100, keyword: 'kra pin' },
  'kra tax compliance cert': { name: 'KRA Tax Compliance Cert.', price: 250, keyword: 'kra compliance' },
  'nhif self-registration': { name: 'NHIF Self-Registration', price: 150, keyword: 'nhif' },
  'nssf self-registration': { name: 'NSSF Self-Registration', price: 150, keyword: 'nssf' },
  'business name search': { name: 'Business Name Search', price: 200, keyword: 'biz search' },
  'business name registration': { name: 'Business Name Registration', price: 1000, keyword: 'biz reg' },
  'ecitizen account creation': { name: 'eCitizen Account Creation', price: 100, keyword: 'ecitizen' },
  'academic certificate search': { name: 'Academic Certificate Search', price: 200, keyword: 'cert search' },
};

// --- STATE MANAGEMENT (Simplified for this example) ---
// In a real app, use Redis or a database for persistent state
const userState = {}; // { chatId: { service: 'kra nil returns', awaitingPhone: true, platform: 'whatsapp' } }

// --- INTASEND STK PUSH FUNCTION ---
async function createIntaSendStkPush(phone_number, amount, service_name, api_ref) {
  try {
    const IntaSend = require('intasend-node');
    let intasend = new IntaSend(INTASEND_PUBLIC, INTASEND_SECRET, false); // Set to false for live mode
    let collection = intasend.collection();

    const response = await collection.mpesaStkPush({
      phone_number: phone_number,
      amount: amount,
      currency: 'KES',
      email: `user_${phone_number}@example.com`, // Dummy email
      first_name: 'Customer',
      last_name: phone_number, // Store phone in last_name for webhook callback
      api_ref: api_ref,
      narrative: service_name,
      host: `https://whatsapp-cyber-cafe.onrender.com/intasend-webhook` // Hardcoded for simplicity
    } );
    console.log('STK Push Response:', response);
    return response;
  } catch (error) {
    console.error('IntaSend STK Push Error:', error.response?.data || error.message);
    return null;
  }
}

// --- WHATSAPP LOGIC ---
app.post('/webhook', async (req, res) => {
  const body = req.body;
  if (body.object === 'whatsapp_business_account') {
    for (const entry of body.entry) {
      for (const change of entry.changes) {
        if (change.field === 'messages') {
          const message = change.value.messages && change.value.messages[0];
          if (message && message.type === 'text') {
            const from = message.from;
            const text = message.text.body.toLowerCase();

            if (userState[from] && userState[from].awaitingPhone && userState[from].platform === 'whatsapp') {
              // User is responding with phone number for STK Push
              const serviceKey = userState[from].service;
              const service = services[serviceKey];
              const phoneNumber = text.replace(/\D/g, ''); // Clean phone number

              if (phoneNumber.length >= 9 && phoneNumber.startsWith('254')) {
                await sendMessage(from, `Initiating STK Push for ${service.name} (KES ${service.price}) to ${phoneNumber}...`);
                const stkResponse = await createIntaSendStkPush(phoneNumber, service.price, service.name, `${serviceKey}-${from}`);
                if (stkResponse && stkResponse.status === 'success') {
                  await sendMessage(from, 'Please check your phone for the M-Pesa STK Push prompt and enter your PIN.');
                } else {
                  await sendMessage(from, 'Failed to initiate STK Push. Please try again or contact support.');
                }
                delete userState[from]; // Clear state
              } else {
                await sendMessage(from, 'Invalid phone number. Please send a valid M-Pesa number (e.g., 2547XXXXXXXX).');
              }
            } else {
              // Normal message handling
              const matchedService = Object.values(services).find(s => text.includes(s.keyword));

              if (text === 'hi' || text === 'menu' || text === 'start') {
                await sendWhatsAppMenu(from);
              } else if (matchedService) {
                userState[from] = { service: matchedService.keyword, awaitingPhone: true, platform: 'whatsapp' };
                await sendMessage(from, `You selected ${matchedService.name}. Please send your M-Pesa phone number (e.g., 2547XXXXXXXX) to proceed with payment of KES ${matchedService.price}.`);
              } else {
                await sendMessage(from, 'Sorry, I didn\'t understand that. Please type 
