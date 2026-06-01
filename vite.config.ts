import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import packageJson from './package.json'

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    // Inject the exact version of the WASM backend from package.json
    __TFJS_VERSION__: JSON.stringify(packageJson.dependencies['@tensorflow/tfjs-backend-wasm'].replace(/[^0-9.]/g, ''))
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Visual Check Validator',
        short_name: 'VCV',
        description: 'Edge AI-based offline validation tool',
        theme_color: '#ffffff',
        // iOS SafariのIndexedDB消去回避のため、Standaloneモードを強制
        display: 'standalone',
        icons: [
          {
            src: '/icon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
  }
})
