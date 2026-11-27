import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: { entry: 'main.ts', formats: ['es'], fileName: () => 'app.js' }
  }
})
