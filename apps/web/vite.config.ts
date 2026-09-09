import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 5174,
    host: '0.0.0.0',
    headers: {
      'Cache-Control': 'no-store',
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false,
        ws: true,
        timeout: 300000,
        proxyTimeout: 300000,
        cookieDomainRewrite: 'localhost',
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('[proxy error]', err.message);
          });
        },
      },
      '/live2d/models': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false,
        timeout: 300000,
        proxyTimeout: 300000,
      },
      '/health': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        secure: false,
      },
    }
  },
  optimizeDeps: {
    include: [
      'pixi.js',
    ],
    exclude: [
      'pixi-live2d-display',
      '@mediapipe/tasks-vision',
      '@mediapipe/camera_utils',
      '@mediapipe/control_utils',
      '@mediapipe/drawing_utils',
      '@mediapipe/face_detection',
      '@mediapipe/face_mesh',
      '@mediapipe/holistic',
    ],
    esbuildOptions: {
      target: 'esnext',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined,
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      }
    },
    chunkSizeWarningLimit: 2000,
    commonjsOptions: {
      include: [/pixi-live2d-display/, /node_modules/],
      transformMixedEsModules: true,
    },
    sourcemap: true,
  },
})