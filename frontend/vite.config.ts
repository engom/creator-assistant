import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // When VITE_API_URL is set the browser calls it directly — no proxy needed.
  // When absent, proxy /api → localhost:8000 (SSM tunnel or local server).
  const backendUrl = env.VITE_API_URL ?? 'http://localhost:8000'
  const useProxy = !env.VITE_API_URL

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      port: 5173,
      host: true,
      allowedHosts: ['.trycloudflare.com'],
      proxy: useProxy
        ? {
            '/api': {
              target: backendUrl,
              changeOrigin: true,
              rewrite: (p) => p.replace(/^\/api/, ''),
            },
          }
        : undefined,
    },
  }
})
