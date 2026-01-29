import { useEffect, useState } from 'react';

// Pusher is optional - will work without it using polling
let pusherInstance: any = null;

export function usePusher() {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Only initialize Pusher if keys are configured
    const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const pusherCluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    
    if (!pusherKey || !pusherCluster || pusherKey === 'your_pusher_key') {
      console.log('Pusher not configured - using polling mode');
      return;
    }

    if (!pusherInstance && typeof window !== 'undefined') {
      // Dynamic import to avoid errors when Pusher is not needed
      import('pusher-js').then((PusherModule) => {
        const PusherClient = PusherModule.default;
        pusherInstance = new PusherClient(pusherKey, {
          cluster: pusherCluster,
        });

        pusherInstance.connection.bind('connected', () => {
          console.log('Pusher connected');
          setIsConnected(true);
        });

        pusherInstance.connection.bind('disconnected', () => {
          console.log('Pusher disconnected');
          setIsConnected(false);
        });
      }).catch((err) => {
        console.log('Pusher not available:', err.message);
      });
    }

    return () => {
      // Don't disconnect on unmount, keep connection alive
    };
  }, []);

  const subscribe = (channelName: string) => {
    if (!pusherInstance) {
      // Return a mock channel that does nothing
      return {
        bind: () => {},
        unbind: () => {},
        unbind_all: () => {},
      };
    }
    return pusherInstance.subscribe(channelName);
  };

  const unsubscribe = (channelName: string) => {
    if (!pusherInstance) return;
    pusherInstance.unsubscribe(channelName);
  };

  return { subscribe, unsubscribe, isConnected };
}
