import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const src = (file: string): string => fileURLToPath(new URL(`./src/${file}`, import.meta.url))

export default defineConfig({
  resolve: {
    // The examples import the package by name; run them on the source.
    alias: [
      { find: /^@osdlc\/markdown-contract\/core$/, replacement: src('core/index.ts') },
      {
        find: /^@osdlc\/markdown-contract\/declarative$/,
        replacement: src('declarative/index.ts'),
      },
      { find: /^@osdlc\/markdown-contract\/cli$/, replacement: src('cli/index.ts') },
      { find: /^@osdlc\/markdown-contract$/, replacement: src('index.ts') },
    ],
  },
  test: {
    // tests/ holds the unit tests (mirroring src/) and the fixture-driven suites;
    // examples/ holds the runnable usage examples.
    include: ['tests/**/*.test.ts', 'examples/**/*.test.ts'],
    // Builds dist/ once: the CLI tests run the built bin, and tests/core-entry.test.ts reads
    // the built import graph.
    globalSetup: ['tests/global-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text'],
    },
  },
})
