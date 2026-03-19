import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  envDir: fileURLToPath(new URL('.', import.meta.url)), // always load .env from desktop-client/
  plugins: [
    react(),
    // Polyfill Node built-ins (stream, buffer, util, events) used by simple-peer
    nodePolyfills({
      include: ['stream', 'buffer', 'util', 'events', 'process'],
      globals: { Buffer: true, global: true, process: true },
      protocolImports: true,
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.ico', 'icon.png', 'icon.webp', 'apple-touch-icon.png', 'PWA-icon.png'],
      manifest: {
        name: 'TeleDesk',
        short_name: 'TeleDesk',
        description: 'TeleDesk — Messaging & Video Calls',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'PWA-icon.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'PWA-icon.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'PWA-icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,webp,woff2}'],
        navigateFallback: null,
        navigateFallbackAllowlist: [/^\/call-window/, /^\/incoming-call-window/, /^(?!\/__).*/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  base: process.env.NODE_ENV === 'production' ? './' : '/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
    strictPort: true,
    fs: {
      allow: [
        fileURLToPath(new URL('.', import.meta.url)),
        fileURLToPath(new URL('../shared', import.meta.url)),
      ],
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
      },
    },
  },
  define: {
    'process.env': {},
    global: 'globalThis',
  },
});

