import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // App instalable (PWA). El service worker propio está en src/sw.ts: hoy solo guarda los archivos de la app
    // y más adelante recibirá las notificaciones push. En desarrollo (npm run dev) no se activa;
    // para probarla: npm run build y luego npm run preview.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        id: '/',
        name: 'Levain',
        short_name: 'Levain',
        description: 'Levain: inteligencia para gestionar, producir y reducir desperdicios.',
        lang: 'es-CO',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#22374A',
        theme_color: '#22374A',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,jpg}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
})
