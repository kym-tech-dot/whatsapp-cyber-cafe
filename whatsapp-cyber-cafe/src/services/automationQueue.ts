import Redis from 'ioredis';
import { fileKraNilReturns } from './automation/kraNilReturns';
import { WhatsAppService } from './whatsapp';
import { StateService } from './state';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
const QUEUE_NAME = 'automation_queue';

export class AutomationQueue {
  // Add task to Redis list (Queue)
  static async add(task: any) {
    await redis.rpush(QUEUE_NAME, JSON.stringify(task));
    console.log(`Task added to queue: ${task.service} for ${task.phone}`);
  }

  // Worker loop to process tasks (Runs continuously in a separate process or background loop)
  static async processQueue() {
    console.log('Worker listening for automation tasks...');
    while (true) {
      try {
        // Block until a task is available (BLPOP)
        const result = await redis.blpop(QUEUE_NAME, 0);
        if (result) {
          const task = JSON.parse(result[1]);
          console.log(`Processing task: ${task.service} for ${task.phone}`);
          
          await this.executeTask(task);
        }
      } catch (error) {
        console.error('Error processing task:', error);
        // Sleep briefly to prevent tight loop on persistent error
        await new Promise(resolve => setTimeout(result, 5000));
      }
    }
  }

  private static async executeTask(task: any) {
    const { service, phone, data } = task;

    try {
      if (service === 'kra_nil') {
        const { kra_pin, kra_password } = data;
        const receiptUrl = await fileKraNilReturns(kra_pin, kra_password);
        
        await WhatsAppService.sendMessage(phone, `Success! Your KRA NIL Returns have been filed. Here is your receipt: ${receiptUrl}`);
        await WhatsAppService.sendMainMenu(phone);
      } else {
        await WhatsAppService.sendMessage(phone, `Service ${service} is currently under maintenance.`);
      }
    } catch (error: any) {
      console.error(`Automation failed for ${phone}:`, error.message);
      await WhatsAppService.sendMessage(phone, `Sorry, I encountered an error while processing your request: ${error.message}. Please check your credentials and try again later.`);
    } finally {
      // Clear session after task completion or failure
      await StateService.clearSession(phone);
    }
  }
}
