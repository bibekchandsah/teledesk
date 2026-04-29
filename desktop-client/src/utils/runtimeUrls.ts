const FALLBACK_BACKEND_URL = 'http://localhost:3001';

const getBrowserHostBackendUrl = (): string => {
  if (typeof window === 'undefined') return FALLBACK_BACKEND_URL;

  const { hostname, protocol, origin } = window.location;

  // On HTTPS pages, always prefer same-origin (use Vite proxy) to avoid mixed content.
  if (protocol === 'https:') return origin;

  if (!hostname || protocol === 'file:' || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return FALLBACK_BACKEND_URL;
  }

  return `${protocol}//${hostname}:3001`;
};

const getEnvUrlIfCompatible = (envUrl: string | undefined): string | undefined => {
  if (!envUrl) return undefined;
  if (typeof window === 'undefined') return envUrl;

  const pageProtocol = window.location.protocol;
  if (pageProtocol !== 'https:') return envUrl;

  try {
    const parsed = new URL(envUrl);
    if (parsed.protocol === 'https:') return envUrl;
  } catch {
    // If envUrl is not a valid URL and we are on HTTPS, ignore it to avoid mixed content
  }

  return undefined;
};

export const getBackendUrl = (): string =>
  getEnvUrlIfCompatible(import.meta.env.VITE_BACKEND_URL) || getBrowserHostBackendUrl();

export const getSocketUrl = (): string =>
  getEnvUrlIfCompatible(import.meta.env.VITE_SOCKET_URL) || getBackendUrl();