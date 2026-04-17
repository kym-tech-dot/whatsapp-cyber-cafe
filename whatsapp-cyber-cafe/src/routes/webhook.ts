import { Router } from 'express';
import { WhatsAppController } from '../controllers/whatsappController';

export const webhookRouter = Router();

// WhatsApp Webhook Verification
webhookRouter.get('/whatsapp', WhatsAppController.verifyWebhook);

// WhatsApp Message Handler
webhookRouter.post('/whatsapp', WhatsAppController.handleWebhook);
