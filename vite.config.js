// vite.config.js
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  console.log('🔹 Vite режим:', mode)
  console.log('🔹 Proxy target:', env.VITE_PROXY_BASE_URL)

  return {
    plugins: [react()], // <-- ВАЖНО
    server: command === 'serve'
      ? {
          proxy: {
            '/api': {
              target: env.VITE_PROXY_BASE_URL,
              changeOrigin: true,
              secure: false,
              rewrite: (path) => path.replace(/^\/api/, ''),
            },
          },
        }
      : undefined,
  }
})
