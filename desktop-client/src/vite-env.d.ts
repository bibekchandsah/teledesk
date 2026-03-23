/// <reference types="vite/client" />

// Extend Window interface to include Electron API
interface Window {
  electronAPI?: {
    openExternalUrl: (url: string) => Promise<boolean>;
    onAuthExternalToken: (callback: (token: string) => void) => () => void;
    // Add other electron API methods as needed
  };
}
