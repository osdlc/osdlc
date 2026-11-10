import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

// Component tests opt into jsdom per file (`// @vitest-environment jsdom`): jsdom
// replaces the global URL, which breaks `new URL(..., import.meta.url)` elsewhere.
export default defineConfig({
  resolve: {
    // The examples import the package by name. Point the name at the source.
    alias: [
      {
        find: /^@osdlc\/markdown-render-vue$/,
        replacement: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      },
    ],
  },
  test: {
    include: ['tests/**/*.test.ts', 'examples/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text'],
    },
  },
})
