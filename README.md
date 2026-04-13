# KRA iTax NIL Return Automation Bot

A production-grade, scalable Telegram bot that automates KRA iTax NIL returns using Puppeteer.

This system has been fully refactored to address instability, "not clickable" errors, and scalability issues present in simpler script-based implementations. It is designed to run reliably in cloud environments (like Render) and handle multiple users concurrently without resource exhaustion.

## Key Features

- **Robust Puppeteer Automation:** Replaces fragile `waitForSelector` calls with an `engineeredClick` utility that ensures elements are visible, scrolled into view, and the network is idle before clicking. It includes built-in retries and JavaScript fallbacks to eliminate "Node is either not clickable or not an Element" errors.
- **Multi-User Job Queue:** Implements a FIFO queue system (`queue.js`) that safely manages concurrent requests from multiple Telegram users.
- **Concurrency Control:** A dedicated worker manager (`worker.js`) limits the number of active browser instances (default: 2) to prevent memory overload and browser crashes.
- **Stealth & Reliability:** Uses `puppeteer-extra-plugin-stealth` and overrides `navigator.webdriver` to avoid bot detection on the KRA portal.
- **Observability & Debugging:** On every failure, the system automatically captures a full-page screenshot and HTML dump to a `debug/` directory. Structured logging provides step-by-step visibility into the automation process.
- **User Feedback:** Provides real-time updates to users via Telegram, including queue position, processing start, and final success/failure status.

## Architecture

The codebase is modularised for clean separation of concerns:

- `src/bot.js`: Handles Telegram interactions, collects credentials, and enqueues jobs.
- `src/queue.js`: Manages the FIFO job queue, job states, and retry logic.
- `src/worker.js`: Processes jobs sequentially, enforcing concurrency limits.
- `src/kraService.js`: Encapsulates all Puppeteer logic for interacting with the KRA iTax portal.
- `src/logger.js`: Provides structured logging.

## Setup Instructions

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment:**
   Copy `.env.example` to `.env` and add your Telegram Bot Token.
   ```bash
   cp .env.example .env
   ```

3. **Run the Bot:**
   ```bash
   npm start
   ```
   For development with auto-reload:
   ```bash
   npm run dev
   ```

## Design Decisions

- **Why `engineeredClick`?** The KRA portal is notoriously slow and heavily relies on JavaScript for navigation (e.g., `href="javascript:loginContinue()"`). Standard Puppeteer clicks often fail because elements are detached or obscured. The `engineeredClick` utility solves this by combining visibility checks, network idle waits, scrolling, retries, and a final JS fallback.
- **Why an In-Memory Queue?** For a single-server deployment, an in-memory array-based queue is sufficient and keeps the architecture simple. The queue interface is designed to be easily swappable with a Redis-backed solution (like BullMQ) if horizontal scaling across multiple servers is required in the future.
- **Why Concurrency Limits?** Cloud platforms like Render have strict memory limits. Running too many headless browsers simultaneously will cause the server to crash. The `worker.js` module ensures that only a safe number of browsers (configurable via `MAX_WORKERS`) run at any given time.
