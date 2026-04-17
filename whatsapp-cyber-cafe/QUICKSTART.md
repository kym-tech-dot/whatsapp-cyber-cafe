# WhatsApp Cyber Café Bot - Quickstart Guide

This guide will help you deploy the free version of the WhatsApp Cyber Café Bot in under 5 minutes. The bot handles KRA NIL Returns automatically using Playwright headless browsers.

## 1. Prerequisites

Before you start, you need:
1. A Linux Server (Ubuntu 22.04 recommended) with at least 2GB RAM.
2. Docker and Docker Compose installed.
3. A Meta Developer Account with a WhatsApp Business App set up.

## 2. Environment Setup

1. Clone or copy this repository to your server.
2. Navigate to the project directory:
   ```bash
   cd whatsapp-cyber-cafe
   ```
3. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
4. Edit the `.env` file and fill in your Meta/WhatsApp credentials:
   - `WHATSAPP_TOKEN`: Your permanent access token from Meta.
   - `WHATSAPP_PHONE_NUMBER_ID`: The ID of your WhatsApp business number.
   - `VERIFY_TOKEN`: Create a secure random string (e.g., `my_secure_token_123`). You will need this for the Meta Webhook setup.
   - `APP_URL`: Your server's public URL (e.g., `https://api.mycybercafe.com`).

## 3. Deployment

Start the application using Docker Compose. This will spin up the Node.js API, the Redis queue, the PostgreSQL database, and the Playwright worker.

```bash
docker-compose up -d --build
```

Verify that all containers are running:

```bash
docker-compose ps
```

You should see `api`, `worker`, `redis`, and `db` running.

## 4. Connect WhatsApp Webhook

1. Go to your [Meta App Dashboard](https://developers.facebook.com/).
2. Navigate to **WhatsApp > Configuration**.
3. Under **Webhook**, click **Edit**.
4. Set the Callback URL to: `https://your-domain.com/api/webhooks/whatsapp`
5. Set the Verify Token to the string you chose in step 2 (e.g., `my_secure_token_123`).
6. Click **Verify and Save**.
7. Click **Manage** next to Webhook fields and subscribe to the `messages` event.

## 5. Testing the Bot

1. Send a WhatsApp message saying "Hi" or "Menu" to your configured business number.
2. The bot should reply with the Main Menu.
3. Select "Government Services" -> "KRA NIL Returns".
4. Provide a valid KRA PIN format (e.g., `A123456789Z`) and your iTax password.
5. Confirm the action. The bot will enqueue the task, launch a headless browser, file the return, and send you a link to the downloaded receipt.

## Architecture Notes

- **State Management:** User sessions are stored in Redis with a 1-hour timeout.
- **Automation Queue:** The Express API adds tasks to a Redis queue. A separate worker process (`AutomationQueue.processQueue()`) picks them up to prevent blocking the main API thread.
- **Playwright:** The worker container uses the official Microsoft Playwright Docker image to ensure all browser dependencies are present.
