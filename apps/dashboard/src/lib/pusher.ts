import Pusher from 'pusher';
import PusherClient from 'pusher-js';

// Server-side Pusher instance
export const pusherServer = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true,
});

// Client-side Pusher instance factory
export function getPusherClient() {
  return new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
  });
}

// Helper to trigger events
export async function triggerRealtimeUpdate(
  channelName: string,
  eventType: string,
  data: any
) {
  try {
    await pusherServer.trigger(channelName, eventType, {
      type: eventType,
      payload: data,
      timestamp: new Date().toISOString(),
    });
    console.log(`Pusher event triggered: ${channelName} / ${eventType}`);
  } catch (error) {
    console.error('Failed to trigger Pusher event:', error);
  }
}

