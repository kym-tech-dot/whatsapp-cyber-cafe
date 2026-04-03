import Redis from 'ioredis';

// Ensure REDIS_URL is available, fallback to localhost for development
const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

export class StateService {
  private static readonly TTL = 3600; // 1 hour session timeout

  static async getSession(phone: string) {
    const sessionStr = await redis.get(`session:${phone}`);
    return sessionStr ? JSON.parse(sessionStr) : null;
  }

  static async updateState(phone: string, state: string, initialData: any = {}) {
    let session = await this.getSession(phone);
    if (!session) {
      session = { phone_number: phone, collected_data: {} };
    }
    session.current_state = state;
    session.collected_data = { ...session.collected_data, ...initialData };
    
    await redis.setex(`session:${phone}`, this.TTL, JSON.stringify(session));
    return session;
  }

  static async updateStateData(phone: string, data: any) {
    const session = await this.getSession(phone);
    if (session) {
      session.collected_data = { ...session.collected_data, ...data };
      await redis.setex(`session:${phone}`, this.TTL, JSON.stringify(session));
    }
  }

  static async clearSession(phone: string) {
    await redis.del(`session:${phone}`);
  }
}
