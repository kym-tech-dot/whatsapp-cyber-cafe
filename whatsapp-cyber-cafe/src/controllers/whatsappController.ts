import { Request, Response } from 'express';
import { WhatsAppService } from '../services/whatsapp';
import { StateService } from '../services/state';
import { AutomationQueue } from '../services/automationQueue';

export class WhatsAppController {
  // Verify webhook for Meta API setup
  static verifyWebhook(req: Request, res: Response) {
    const verifyToken = process.env.VERIFY_TOKEN;
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
      if (mode === 'subscribe' && token === verifyToken) {
        console.log('WEBHOOK_VERIFIED');
        res.status(200).send(challenge);
      } else {
        res.sendStatus(403);
      }
    } else {
      res.sendStatus(400);
    }
  }

  // Handle incoming WhatsApp messages
  static async handleWebhook(req: Request, res: Response) {
    // Acknowledge receipt to Meta immediately to prevent retries
    res.sendStatus(200);

    const body = req.body;
    if (body.object === 'whatsapp_business_account') {
      try {
        for (const entry of body.entry) {
          for (const change of entry.changes) {
            if (change.value.messages) {
              const message = change.value.messages[0];
              const phoneNumber = message.from;
              
              // Retrieve current session state from Redis
              const session = await StateService.getSession(phoneNumber);
              
              // Route based on message type
              if (message.type === 'interactive') {
                await WhatsAppController.handleInteractiveMessage(phoneNumber, message.interactive, session);
              } else if (message.type === 'text') {
                await WhatsAppController.handleTextMessage(phoneNumber, message.text.body, session);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error handling webhook payload:', error);
      }
    }
  }

  static async handleInteractiveMessage(phone: string, interactive: any, session: any) {
    const actionId = interactive.list_reply?.id || interactive.button_reply?.id;

    switch (actionId) {
      case 'cat_gov':
        await WhatsAppService.sendGovernmentMenu(phone);
        await StateService.updateState(phone, 'VIEWING_GOV_MENU');
        break;
      case 'srv_kra_nil':
        await WhatsAppService.sendMessage(phone, "You selected KRA NIL Returns (Free Service). Please reply with your KRA PIN.");
        await StateService.updateState(phone, 'AWAITING_KRA_PIN', { service: 'kra_nil' });
        break;
      case 'confirm_kra_nil':
        await WhatsAppService.sendMessage(phone, "Processing your KRA NIL Returns. This usually takes 1-2 minutes. Please wait...");
        
        // Queue the automation task directly
        await AutomationQueue.add({
          service: 'kra_nil',
          phone: phone,
          data: session.collected_data
        });
        
        await StateService.updateState(phone, 'PROCESSING_AUTOMATION');
        break;
      case 'cancel_action':
        await WhatsAppService.sendMessage(phone, "Action cancelled.");
        await WhatsAppService.sendMainMenu(phone);
        await StateService.clearSession(phone);
        break;
      case 'menu_main':
      default:
        await WhatsAppService.sendMainMenu(phone);
        await StateService.clearSession(phone);
    }
  }

  static async handleTextMessage(phone: string, text: string, session: any) {
    const currentState = session?.current_state;
    const lowerText = text.toLowerCase().trim();

    // Global reset commands
    if (['hi', 'hello', 'menu', 'start', 'cancel'].includes(lowerText)) {
      await WhatsAppService.sendMainMenu(phone);
      await StateService.clearSession(phone);
      return;
    }

    switch (currentState) {
      case 'AWAITING_KRA_PIN':
        if (/^[A-Z][0-9]{9}[A-Z]$/i.test(text.trim())) {
          await StateService.updateStateData(phone, { kra_pin: text.trim().toUpperCase() });
          await WhatsAppService.sendMessage(phone, "Thank you. Now reply with your iTax Password.");
          await StateService.updateState(phone, 'AWAITING_KRA_PASSWORD');
        } else {
          await WhatsAppService.sendMessage(phone, "Invalid KRA PIN format. It should look like 'A123456789Z'. Please try again.");
        }
        break;
      case 'AWAITING_KRA_PASSWORD':
        await StateService.updateStateData(phone, { kra_password: text.trim() });
        await WhatsAppService.sendActionConfirmation(phone, 'kra_nil');
        break;
      default:
        await WhatsAppService.sendMainMenu(phone);
    }
  }
}
