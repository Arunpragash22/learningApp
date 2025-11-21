import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Fix 404 on refresh - fallback to index.html for client-side routing
    historyApiFallback: true,
  },
  preview: {
    port: 5173,
    host: true,
    // Fix 404 on refresh for production preview
    historyApiFallback: true,
  },
})
