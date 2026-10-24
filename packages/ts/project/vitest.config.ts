import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url))

const plugins = [
  'node',
  'rust',
  'python',
  'jvm',
  'php',
  'swift',
  'ruby',
  'go',
  'deno',
  'runners',
  'tools',
]

export default defineConfig({
  resolve: {
    // The examples import the package by name; run them on the source.
    alias: [
      { find: /^@osdlc\/project$/, replacement: src('./src/index.ts') },
      { find: /^@osdlc\/project\/builtins$/, replacement: src('./src/builtins.ts') },
      ...['match', 'params', 'duration'].map((entry) => ({
        find: new RegExp(`^@osdlc/project/${entry}$`),
        replacement: src(`./src/${entry}.ts`),
      })),
      ...plugins.map((entry) => ({
        find: new RegExp(`^@osdlc/project/${entry}$`),
        replacement: src(`./src/plugins/${entry}/index.ts`),
      })),
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
