import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
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
        icons: [] // 本来はアイコン定義が必要だが、今回はPoCのため省略
      }
    })
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
  }
})
