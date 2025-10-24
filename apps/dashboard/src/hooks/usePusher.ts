import { useEffect, useRef, useState } from 'react';
import PusherClient from 'pusher-js';

let pusherInstance: PusherClient | null = null;

export function usePusher() {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!pusherInstance && typeof window !== 'undefined') {
      pusherInstance = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      });

      pusherInstance.connection.bind('connected', () => {
        console.log('Pusher connected');
        setIsConnected(true);
      });

      pusherInstance.connection.bind('disconnected', () => {
        console.log('Pusher disconnected');
        setIsConnected(false);
      });
    }

    return () => {
      // Don't disconnect on unmount, keep connection alive
    };
  }, []);

  const subscribe = (channelName: string) => {
    if (!pusherInstance) {
      throw new Error('Pusher not initialized');
    }
    return pusherInstance.subscribe(channelName);
  };

  const unsubscribe = (channelName: string) => {
    if (!pusherInstance) return;
    pusherInstance.unsubscribe(channelName);
  };

  return { subscribe, unsubscribe, isConnected };
}

