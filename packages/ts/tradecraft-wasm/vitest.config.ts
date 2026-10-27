import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    // The examples import the package by name, and the source imports the
    // glue as `#wasm` (package.json maps that to dist/). Run both on the
    // source and the committed wasm/, so the tests need no build.
    alias: [
      { find: /^@osdlc\/tradecraft-wasm$/, replacement: src('./src/index.ts') },
      { find: /^#wasm$/, replacement: src('./wasm/tradecraft_wasm.js') },
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
