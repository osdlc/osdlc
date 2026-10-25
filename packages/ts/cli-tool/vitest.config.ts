import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    // The examples import the package by name. Point it at the source.
    // The longer subpath comes first so it wins over the bare name.
    alias: [
      { find: '@osdlc/cli-tool/devlink', replacement: src('./src/devlink/index.ts') },
      { find: '@osdlc/cli-tool/command', replacement: src('./src/command/index.ts') },
      { find: '@osdlc/cli-tool/config-command', replacement: src('./src/config-command.ts') },
      { find: '@osdlc/cli-tool/trust-command', replacement: src('./src/trust-command.ts') },
      { find: '@osdlc/cli-tool/guide', replacement: src('./src/guide.ts') },
      { find: '@osdlc/cli-tool/testing', replacement: src('./src/testing.ts') },
      { find: '@osdlc/cli-tool/wrap', replacement: src('./src/wrap.ts') },
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
