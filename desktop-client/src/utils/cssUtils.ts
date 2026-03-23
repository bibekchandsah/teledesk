import React from 'react';

/**
 * Utility function to inject CSS into the document head
 * This is a safer alternative to inline <style> tags in JSX
 */
export function injectCSS(css: string, id?: string): void {
  // Check if style element with this ID already exists
  if (id && document.getElementById(id)) {
    return;
  }

  const style = document.createElement('style');
  style.type = 'text/css';
  if (id) {
    style.id = id;
  }
  
  if ((style as any).styleSheet) {
    // IE support
    (style as any).styleSheet.cssText = css;
  } else {
    style.appendChild(document.createTextNode(css));
  }
  
  document.head.appendChild(style);
}

/**
 * Remove injected CSS by ID
 */
export function removeCSS(id: string): void {
  const element = document.getElementById(id);
  if (element && element.parentNode) {
    element.parentNode.removeChild(element);
  }
}

/**
 * Hook to inject CSS on component mount and remove on unmount
 */
export function useInjectCSS(css: string, id?: string): void {
  React.useEffect(() => {
    injectCSS(css, id);
    
    return () => {
      if (id) {
        removeCSS(id);
      }
    };
  }, [css, id]);
}