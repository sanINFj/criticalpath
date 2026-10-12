import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const projectRoot = process.cwd()

export default defineConfig({
  root: resolve(projectRoot, 'src/renderer'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve(projectRoot, 'src/renderer/src')
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: resolve(projectRoot, 'dist-web'),
    emptyOutDir: true
  }
})
