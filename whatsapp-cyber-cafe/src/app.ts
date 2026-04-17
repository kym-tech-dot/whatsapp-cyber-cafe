import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { webhookRouter } from './routes/webhook';
import { errorHandler } from './utils/errorHandler';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Webhook routes
app.use('/api/webhooks', webhookRouter);

// Error handling middleware
app.use(errorHandler);

app.listen(port, () => {
  console.log(`WhatsApp Cyber Cafe Bot is running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
