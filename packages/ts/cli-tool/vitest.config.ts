import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    // The examples import the package by name. Point it at the source.
    // The longer subpath comes first so it wins over the bare name.
    alias: [
      { find: '@osdlc/cli-tool/devlink', replacement: src('./src/devlink/index.ts') },
      { find: /^@osdlc\/cli-tool$/, replacement: src('./src/index.ts') },
    ],
  },
  test: {
    include: ['tests/**/*.test.ts', 'devlink/tests/**/*.test.ts', 'examples/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text'],
    },
  },
})
