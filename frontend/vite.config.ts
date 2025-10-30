// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // ✗ '*.ngrok.app' では不可
    // ○ 先頭ドット or 完全一致で書く
    allowedHosts: [
      '.ngrok.app',          // 全ての *.ngrok.app を許可
      '.ngrok.dev',          // 必要なら
      'prothentia.ngrok.app' // 固定で許可（任意）
    ],
  },
})