import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    // The examples import the package by name; run them on the source.
    // The longer subpaths come first so they win over the bare name.
    alias: [
      { find: '@osdlc/cli-tool/devlink', replacement: src('./devlink/index.ts') },
      { find: '@osdlc/cli-tool/trust', replacement: src('./trust/index.ts') },
      { find: /^@osdlc\/cli-tool$/, replacement: src('./index.ts') },
    ],
  },
  test: {
    include: [
      'tests/**/*.test.ts',
      'devlink/tests/**/*.test.ts',
      'trust/tests/**/*.test.ts',
      'examples/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['*.ts', 'devlink/*.ts', 'trust/*.ts'],
      exclude: ['vitest.config.ts'],
      reporter: ['text'],
    },
  },
})
