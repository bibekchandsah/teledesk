import React, { useEffect } from 'react';
import { useUIStore } from '../store/uiStore';

const NetworkListener: React.FC = () => {
  const { setToast } = useUIStore();

  useEffect(() => {
    const handleOnline = () => {
      setToast({
        // message: 'You are back online. Connection restored.',
        message: '!! Connection restored !!.',
        type: 'online',
        sticky: false,
      });
    };

    const handleOffline = () => {
      setToast({
        // message: 'You are offline. Please check your internet connection.',
        message: 'Connection lost!',
        type: 'offline',
        sticky: true,
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check (optional, but requested only to show on change)
    // if (!navigator.onLine) handleOffline();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setToast]);

  return null;
};

export default NetworkListener;
