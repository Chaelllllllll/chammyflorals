const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

interface LogData {
  level: 'info' | 'warning' | 'error' | 'debug';
  message: string;
  data?: any;
  screen?: string;
  action?: string;
  timestamp?: string;
}

class Logger {
  private static instance: Logger;
  private queue: LogData[] = [];
  private isProcessing = false;

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private async sendToDiscord(logData: LogData) {
    try {
      const timestamp = new Date().toISOString();
      const color = {
        info: 3447003,      // Blue
        warning: 16776960,  // Yellow
        error: 15158332,    // Red
        debug: 10070709,    // Gray
      }[logData.level];

      const embed = {
        title: `📱 ${logData.level.toUpperCase()}: ${logData.message}`,
        color,
        fields: [
          { name: '⏰ Time', value: timestamp, inline: true },
          ...(logData.screen ? [{ name: '📄 Screen', value: logData.screen, inline: true }] : []),
          ...(logData.action ? [{ name: '🎯 Action', value: logData.action, inline: true }] : []),
          ...(logData.data ? [{ name: '📊 Data', value: '```json\n' + JSON.stringify(logData.data, null, 2).substring(0, 1000) + '\n```', inline: false }] : []),
        ],
        timestamp,
      };

      await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] }),
      });
    } catch (error) {
      console.error('Failed to send log to Discord:', error);
    }
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    while (this.queue.length > 0) {
      const logData = this.queue.shift();
      if (logData) {
        await this.sendToDiscord(logData);
        // Rate limit: wait 1 second between messages
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    this.isProcessing = false;
  }

  log(level: 'info' | 'warning' | 'error' | 'debug', message: string, data?: any, screen?: string, action?: string) {
    console.log(`[${level.toUpperCase()}] ${screen ? `[${screen}] ` : ''}${message}`, data || '');
    
    this.queue.push({
      level,
      message,
      data,
      screen,
      action,
      timestamp: new Date().toISOString(),
    });

    this.processQueue();
  }

  info(message: string, data?: any, screen?: string, action?: string) {
    this.log('info', message, data, screen, action);
  }

  warning(message: string, data?: any, screen?: string, action?: string) {
    this.log('warning', message, data, screen, action);
  }

  error(message: string, data?: any, screen?: string, action?: string) {
    this.log('error', message, data, screen, action);
  }

  debug(message: string, data?: any, screen?: string, action?: string) {
    this.log('debug', message, data, screen, action);
  }
}

export default Logger.getInstance();
