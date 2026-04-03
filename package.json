import axios from 'axios';

export class WhatsAppService {
  private static get baseUrl() {
    return `https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  }

  private static get headers() {
    return {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    };
  }

  static async sendMessage(to: string, text: string) {
    try {
      await axios.post(
        this.baseUrl,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { body: text },
        },
        { headers: this.headers }
      );
    } catch (error: any) {
      console.error('Error sending WhatsApp message:', error.response?.data || error.message);
    }
  }

  static async sendMainMenu(to: string) {
    try {
      await axios.post(
        this.baseUrl,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'interactive',
          interactive: {
            type: 'list',
            header: { type: 'text', text: 'Digital Cyber Café' },
            body: { text: 'Karibu! I am your Free Digital Cyber Café Assistant. How can I help you today?' },
            footer: { text: 'Select a category below' },
            action: {
              button: 'View Services',
              sections: [
                {
                  title: 'Available Categories',
                  rows: [
                    { id: 'cat_gov', title: '🏛️ Government Services', description: 'KRA, eCitizen, NTSA' },
                    { id: 'cat_doc', title: '📄 Document Services', description: 'CVs, PDFs' },
                  ],
                },
              ],
            },
          },
        },
        { headers: this.headers }
      );
    } catch (error: any) {
      console.error('Error sending Main Menu:', error.response?.data || error.message);
    }
  }

  static async sendGovernmentMenu(to: string) {
    try {
      await axios.post(
        this.baseUrl,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'interactive',
          interactive: {
            type: 'list',
            body: { text: 'Which Government Service do you need? (All services are currently free)' },
            action: {
              button: 'Select Service',
              sections: [
                {
                  title: 'Government Services',
                  rows: [
                    { id: 'srv_kra_nil', title: 'KRA NIL Returns', description: 'Automated filing' },
                    { id: 'menu_main', title: '🔙 Back to Main Menu' },
                  ],
                },
              ],
            },
          },
        },
        { headers: this.headers }
      );
    } catch (error: any) {
      console.error('Error sending Gov Menu:', error.response?.data || error.message);
    }
  }

  static async sendActionConfirmation(to: string, serviceId: string) {
    try {
      await axios.post(
        this.baseUrl,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: 'Your KRA PIN and Password have been securely received. Would you like to proceed with filing your NIL Returns for free?' },
            action: {
              buttons: [
                { type: 'reply', reply: { id: `confirm_${serviceId}`, title: 'Yes, Proceed' } },
                { type: 'reply', reply: { id: 'cancel_action', title: 'Cancel' } },
              ],
            },
          },
        },
        { headers: this.headers }
      );
    } catch (error: any) {
      console.error('Error sending Action Confirmation:', error.response?.data || error.message);
    }
  }
}
