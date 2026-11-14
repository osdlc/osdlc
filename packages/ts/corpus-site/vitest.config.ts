import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

// Component tests opt into jsdom per file (`// @vitest-environment jsdom`). The build test runs
// `astro build`, which reads dist/, so build first.
export default defineConfig({
  resolve: {
    // The examples import the package by name. Point the name at the source.
    alias: [
      {
        find: /^@osdlc\/corpus-site$/,
        replacement: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      },
      {
        find: /^@osdlc\/corpus-site\/client$/,
        replacement: fileURLToPath(new URL('./src/client.ts', import.meta.url)),
      },
      {
        find: /^@osdlc\/corpus-site\/components$/,
        replacement: fileURLToPath(new URL('./src/components/index.ts', import.meta.url)),
      },
    ],
  },
  test: {
    include: ['tests/**/*.test.ts', 'examples/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'examples/site/dist/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text'],
    },
  },
})
