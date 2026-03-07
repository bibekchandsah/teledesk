/**
 * Triggers a desktop notification via Electron API (if available)
 * Falls back to Web Notifications API in browser context.
 */
export const showNotification = (payload: {
  title: string;
  body: string;
  icon?: string;
}): void => {
  // Electron context
  if (window.electronAPI?.showNotification) {
    window.electronAPI.showNotification(payload);
    return;
  }

  // Web Notifications fallback
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(payload.title, {
      body: payload.body,
      icon: payload.icon,
    });
  } else if ('Notification' in window && Notification.permission !== 'denied') {
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        new Notification(payload.title, {
          body: payload.body,
          icon: payload.icon,
        });
      }
    });
  }
};

/**
 * Request notification permission (Web API)
 */
export const requestNotificationPermission = async (): Promise<void> => {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
};
