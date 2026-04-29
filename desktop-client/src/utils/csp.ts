/**
 * Dynamic CSP Configuration
 * Updates CSP to allow connections to the configured backend URL
 */

function getBrowserBackendUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:3001';

  const { hostname, protocol } = window.location;

  if (!hostname || protocol === 'file:' || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return 'http://localhost:3001';
  }

  return `${protocol}//${hostname}:3001`;
}

export const updateCSPForBackend = () => {
  const backendUrl = import.meta.env.VITE_BACKEND_URL || getBrowserBackendUrl();
  const socketUrl = import.meta.env.VITE_SOCKET_URL || backendUrl;
  
  try {
    // Extract hostname and port from URLs
    const backendHost = new URL(backendUrl).host;
    const socketHost = new URL(socketUrl).host;
    
    // Get current CSP
    const metaCSP = document.querySelector('meta[http-equiv="Content-Security-Policy"]') as HTMLMetaElement;
    
    if (metaCSP) {
      let cspContent = metaCSP.content;
      
      // Add backend hosts to connect-src if not already present
      const hosts = [backendHost, socketHost].filter((host, index, arr) => arr.indexOf(host) === index);
      
      hosts.forEach(host => {
        const httpHost = `http://${host}`;
        const wsHost = `ws://${host}`;
        
        if (!cspContent.includes(httpHost)) {
          cspContent = cspContent.replace('connect-src ', `connect-src ${httpHost} `);
        }
        
        if (!cspContent.includes(wsHost)) {
          cspContent = cspContent.replace('connect-src ', `connect-src ${wsHost} `);
        }
        
        // Also add to img-src for avatars/uploads
        if (!cspContent.includes(httpHost)) {
          cspContent = cspContent.replace('img-src ', `img-src ${httpHost} `);
        }
      });
      
      metaCSP.content = cspContent;
      console.log('[CSP] Updated CSP for backend:', { backendUrl, socketUrl });
    }
  } catch (error) {
    console.warn('[CSP] Failed to update CSP:', error);
  }
};

// Auto-update CSP on module load
if (typeof window !== 'undefined') {
  updateCSPForBackend();
}