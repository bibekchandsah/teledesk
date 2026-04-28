import React, { useEffect } from 'react';
import { useUIStore } from '../store/uiStore';
import { syncService } from '../services/syncService';

const NetworkListener: React.FC = () => {
  const { setToast, setIsOnline } = useUIStore();

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setToast({
        // message: 'You are back online. Connection restored.',
        message: '!! Connection restored !!.',
        type: 'online',
        sticky: false,
      });
      syncService.processQueue();
    };

    const handleOffline = () => {
      setIsOnline(false);
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
  }, [setToast, setIsOnline]);

  return null;
};

export default NetworkListener;
