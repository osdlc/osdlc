/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // Relative asset paths, so `dist/` works from any folder or static host.
  base: './',
  plugins: [vue()],
  // ELK ships as one prebuilt 1.5 MB file; it already loads in its own chunk.
  build: { chunkSizeWarningLimit: 1600 },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
