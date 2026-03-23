/**
 * Utility to get correct asset paths for both development and production builds
 */

/**
 * Get the correct path for sound assets
 * In development: /assets/sounds/filename
 * In Electron production: ./assets/sounds/filename (relative to index.html)
 */
export function getSoundPath(filename: string): string {
  // Check if we're in Electron environment
  const isElectron = window.electronAPI !== undefined;
  
  if (isElectron) {
    // In Electron, check if we're in development or production
    const isDev = window.location.protocol === 'http:';
    
    if (isDev) {
      // Development mode - use absolute path
      return `/assets/sounds/${filename}`;
    } else {
      // Production mode - files are served from file:// protocol
      // Use relative path from the index.html location
      return `assets/sounds/${filename}`;
    }
  } else {
    // Web browser - use absolute path
    return `/assets/sounds/${filename}`;
  }
}

/**
 * Get the correct path for any asset
 */
export function getAssetPath(relativePath: string): string {
  const isElectron = window.electronAPI !== undefined;
  
  if (isElectron) {
    const isDev = window.location.protocol === 'http:';
    
    if (isDev) {
      return `/${relativePath}`;
    } else {
      return relativePath;
    }
  } else {
    return `/${relativePath}`;
  }
}