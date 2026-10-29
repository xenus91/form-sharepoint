// vite.config.js
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const BUILD_TIME = new Date().toISOString();
const BUILD_ID = BUILD_TIME.slice(0, 16).replace(/[-:T]/g, ""); // ГГГГММДДЧЧММ

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const mainTarget = env.VITE_PROXY_BASE_URL || env.VITE_SP_SITE || env.VITE_SHAREPOINT_URL || ''
  console.log('🔹 Vite режим:', mode)
  console.log('🔹 Proxy target:', mainTarget)

  return {
    base: './',
    // Метка сборки: в консоли браузера видно, какой именно бандл загружен
    // (помогает отличить «код не работает» от «браузер держит старый кэш»).
    define: {
      __BUILD_TIME__: JSON.stringify(BUILD_TIME),
      __BUILD_ID__: JSON.stringify(BUILD_ID),
    },
    plugins: [react()], // <-- ВАЖНО
    server: command === 'serve'
      ? {
          proxy: {
            '/api': {
              target: mainTarget,
              changeOrigin: true,
              secure: false,
              rewrite: (path) => path.replace(/^\/api/, ''),
            },
          },
        }
      : undefined,
  }
})
