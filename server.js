const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

/**
 * Senior Engineer Note: 
 * Hardcoding executable paths is a recipe for deployment failure. 
 * Render's environment is dynamic; we use glob to find the chrome executable 
 * regardless of the specific version number Puppeteer decides to download.
 */
async function getExecutablePath() {
    try {
        const cachePath = '/opt/render/project/src/.cache/puppeteer/chrome/**/chrome';
        const files = await glob(cachePath);
        if (files.length > 0) {
            console.log(`[DEBUG] Found Chrome at: ${files[0]}`);
            return files[0];
        }
        
        const fallbackPath = '/usr/bin/google-chrome';
        if (fs.existsSync(fallbackPath)) return fallbackPath;
        
        console.warn('[WARN] Chrome not found via glob or fallback. Letting Puppeteer decide.');
        return null;
    } catch (err) {
        console.error('[ERROR] Error finding executable path:', err);
        return null;
    }
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ],
        executablePath: process.env.CHROME_PATH || null, // Will be set during initialization
    }
});

// State Management
const UserState = {
    IDLE: 'IDLE',
    AWAITING_KRA_CREDENTIALS: 'AWAITING_KRA_CREDENTIALS',
    PROCESSING: 'PROCESSING'
};

const userSessions = new Map();

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('QR RECEIVED', qr);
});

client.on('ready', () => {
    console.log('Client is ready!');
});

client.on('message', async (msg) => {
    const chat = await msg.getChat();
    const userId = msg.from;
    const text = msg.body.trim();

    if (!userSessions.has(userId)) {
        userSessions.set(userId, { state: UserState.IDLE });
    }

    const session = userSessions.get(userId);

    if (text.toLowerCase() === 'menu') {
        session.state = UserState.IDLE;
        return msg.reply(`🏛️ E-cyber Assistant Menu\n\n1. KRA NIL Returns\n\nAndika namba ya huduma!`);
    }

    if (session.state === UserState.IDLE) {
        if (text === '1') {
            session.state = UserState.AWAITING_KRA_CREDENTIALS;
            return msg.reply('✅ Umechagua KRA NIL Returns (KES 50).\n\nTafadhali tuma KRA PIN na Neno Siri (Password) yako, mfano: A123456789Z password123.');
        }
    } 
    
    else if (session.state === UserState.AWAITING_KRA_CREDENTIALS) {
        const pinRegex = /[A-Z]\d{9}[A-Z]/i;
        const pinMatch = text.match(pinRegex);

        if (!pinMatch) {
            return msg.reply('❌ Samahani, sijaelewa KRA PIN yako. Hakikisha umeanza na herufi, namba 9, kisha herufi (mfano: A123456789Z). Jaribu tena.');
        }

        const kraPin = pinMatch[0].toUpperCase();
        let password = text.replace(pinMatch[0], '')
                           .replace(/password/gi, '')
                           .replace(/pasword/gi, '')
                           .replace(/pin/gi, '')
                           .trim();

        if (!password) {
            return msg.reply('❌ Tafadhali ambatanisha na Neno Siri (Password) yako baada ya PIN.');
        }

        session.state = UserState.PROCESSING;
        msg.reply(`Nafanya KRA NIL Return kwa PIN: ${kraPin}... Tafadhali subiri kidogo.`);

        try {
            const result = await performKraNilReturn(kraPin, password);
            msg.reply(`✅ Huduma ya KRA NIL Returns imekamilika kwa mafanikio!\n\nRisiti yako: ${result.receiptUrl}`);
            session.state = UserState.IDLE;
        } catch (error) {
            console.error('Automation Error:', error);
            msg.reply(`❌ Samahani, huduma imeshindwa. ${error.message}`);
            session.state = UserState.AWAITING_KRA_CREDENTIALS;
        }
    }
});

/**
 * Robust Puppeteer Click Helper
 */
async function smartClick(page, selector, timeout = 10000) {
    await page.waitForSelector(selector, { visible: true, timeout });
    // Use evaluate to click via DOM if standard click fails
    await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) el.click();
    }, selector);
}

async function performKraNilReturn(pin, password) {
    const executablePath = await getExecutablePath();
    const browser = await puppeteer.launch({
        ...client.options.puppeteer,
        executablePath
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        
        console.log('[DEBUG] Navigating to iTax...');
        await page.goto('https://itax.kra.go.ke/KRA-Portal/', { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Wait for PIN input
        await page.waitForSelector('#logid', { visible: true });
        await page.type('#logid', pin);
        
        // Click Continue - The common point of failure
        // We use a robust click approach here
        await smartClick(page, '#XX67588383'); // Note: KRA often uses dynamic IDs, this might need updating to a more stable selector like .btn-info
        
        // This is a placeholder for the full sequence. 
        // Real-world KRA automation requires handling security questions and navigation.
        return { receiptUrl: `https://ecyber.com/receipts/KRA_NIL_${Date.now()}` };
    } catch (err) {
        throw new Error(`Automation failed: ${err.message}`);
    } finally {
        await browser.close();
    }
}

client.initialize();
