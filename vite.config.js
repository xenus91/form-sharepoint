// vite.config.js
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const mainTarget = env.VITE_PROXY_BASE_URL || env.VITE_SP_SITE || env.VITE_SHAREPOINT_URL || ''
  // origin for cross-site (dob) — берем origin из mainTarget, чтоб не дублировать /sites/obrazceo/sites/dob
  let dobOrigin = ''
  try {
    if (mainTarget) dobOrigin = new URL(mainTarget).origin
  } catch {}
  // fallback: if dob site explicitly set
  const dobTarget = env.VITE_DOB_SITE ? new URL(env.VITE_DOB_SITE).origin : (dobOrigin || mainTarget)
  console.log('🔹 Vite режим:', mode)
  console.log('🔹 Proxy target:', mainTarget)
  console.log('🔹 Proxy dob origin:', dobOrigin || '(none)')

  return {
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
            // cross-site dob — отдельный прокси. Важно: когда mainTarget = http://localhost:5000/api (NTLM), Vite должен сохранить префикс /dob-api
            // чтобы NTLM получил /dob-api/sites/dob/... и смог отличить от /api. Поэтому НЕ делаем rewrite для localhost.
            '/dob-api': {
              target: dobOrigin || mainTarget,
              changeOrigin: true,
              secure: false,
              rewrite: (path) => {
                // Если проксируем на NTLM localhost — оставляем /dob-api, иначе режем для прямого SharePoint
                const isLocalhost = (dobOrigin || mainTarget || '').includes('localhost');
                return isLocalhost ? path : path.replace(/^\/dob-api/, '');
              },
            },
          },
        }
      : undefined,
  }
})
