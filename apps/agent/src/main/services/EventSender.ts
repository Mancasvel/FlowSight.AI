import axios, { AxiosError } from 'axios';
import { SemanticEvent, EventResponse } from '@flowsight/shared';
import { ConfigManager } from './ConfigManager';

export class EventSender {
  constructor(private configManager: ConfigManager) {}

  async sendEvent(event: SemanticEvent): Promise<EventResponse> {
    const config = this.configManager.getConfig();

    try {
      const response = await axios.post<EventResponse>(
        `${config.apiUrl}/api/events`,
        event,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
          },
          timeout: 10000,
        }
      );

      console.log('Event sent successfully:', response.data);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<{ error: string }>;
        console.error('Failed to send event:', axiosError.response?.data?.error || axiosError.message);
        
        return {
          success: false,
          error: axiosError.response?.data?.error || axiosError.message,
        };
      }
      
      console.error('Failed to send event:', error);
      return {
        success: false,
        error: 'Unknown error',
      };
    }
  }
}

