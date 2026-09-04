import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@stealthguard/sdk': fileURLToPath(
        new URL('../../packages/stealthguard-sdk/src/index.ts', import.meta.url),
      ),
      '@stealthguard/ui': fileURLToPath(new URL('../../packages/ui/src/index.ts', import.meta.url)),
    },
  },
})
