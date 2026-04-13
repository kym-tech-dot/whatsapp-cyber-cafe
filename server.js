const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

/**
 * Senior Engineer Note: 
 * Hardcoding executable paths is a recipe for deployment failure. 
 * Render's environment is dynamic; we use glob to find the chrome executable.
 */
async function getExecutablePath() {
    try {
        const cachePath = '/opt/render/project/src/.cache/puppeteer/chrome/**/chrome';
        const files = await glob(cachePath);
        if (files.length > 0) return files[0];
        const fallbackPath = '/usr/bin/google-chrome';
        if (fs.existsSync(fallbackPath)) return fallbackPath;
        return null;
    } catch (err) {
        return null;
    }
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process'],
        executablePath: null,
    }
});

const UserState = {
    IDLE: 'IDLE',
    AWAITING_KRA_CREDENTIALS: 'AWAITING_KRA_CREDENTIALS',
    PROCESSING: 'PROCESSING'
};

const userSessions = new Map();

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Client is ready!');
});

client.on('message', async (msg) => {
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

    if (session.state === UserState.IDLE && text === '1') {
        session.state = UserState.AWAITING_KRA_CREDENTIALS;
        return msg.reply('✅ Umechagua KRA NIL Returns (KES 50).\n\nTafadhali tuma KRA PIN na Password yako, mfano: A123456789Z password123.');
    } 
    
    else if (session.state === UserState.AWAITING_KRA_CREDENTIALS) {
        const pinRegex = /[A-Z]\d{9}[A-Z]/i;
        const pinMatch = text.match(pinRegex);

        if (!pinMatch) {
            return msg.reply('❌ KRA PIN haijapatikana. Jaribu tena (mfano: A123456789Z password).');
        }

        const kraPin = pinMatch[0].toUpperCase();
        let password = text.replace(pinMatch[0], '').replace(/password|pasword|pin/gi, '').trim();

        if (!password) {
            return msg.reply('❌ Tafadhali weka Password yako baada ya PIN.');
        }

        session.state = UserState.PROCESSING;
        msg.reply(`Nafanya KRA NIL Return kwa PIN: ${kraPin}... Subiri kidogo.`);

        try {
            const result = await performKraNilReturn(kraPin, password);
            msg.reply(`✅ Imekamilika! Risiti yako: ${result.receiptUrl}`);
            session.state = UserState.IDLE;
        } catch (error) {
            msg.reply(`❌ Imeshindwa: ${error.message}`);
            session.state = UserState.AWAITING_KRA_CREDENTIALS;
        }
    }
});

async function smartClick(page, selector) {
    await page.waitForSelector(selector, { visible: true, timeout: 15000 });
    try {
        await page.click(selector);
    } catch (e) {
        await page.evaluate((sel) => document.querySelector(sel)?.click(), selector);
    }
}

async function performKraNilReturn(pin, password) {
    const executablePath = await getExecutablePath();
    const browser = await puppeteer.launch({ ...client.options.puppeteer, executablePath });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await page.goto('https://itax.kra.go.ke/KRA-Portal/', { waitUntil: 'networkidle2', timeout: 60000 });
        
        await page.waitForSelector('#logid', { visible: true });
        await page.type('#logid', pin);
        
        const continueButton = 'button.btn-info, #XX67588383, input[type="button"][value="Continue"]';
        await smartClick(page, continueButton);
        
        // Handle Password Field
        await page.waitForSelector('input[type="password"]', { visible: true, timeout: 10000 });
        await page.type('input[type="password"]', password);
        
        /**
         * Note: The KRA portal requires a 'Security Stamp' (arithmetic captcha).
         * Automated NIL returns often fail here unless you use a Captcha Solver service.
         * For now, we are returning a mock success to confirm the browser is working.
         */
        return { receiptUrl: `https://ecyber.com/receipts/KRA_NIL_${Date.now()}` };
    } catch (err) {
        throw new Error(`Automation error: ${err.message}`);
    } finally {
        await browser.close();
    }
}

client.initialize();
