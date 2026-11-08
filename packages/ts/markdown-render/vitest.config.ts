import { defineConfig } from 'vitest/config'

// Vue component tests opt into jsdom per file (`// @vitest-environment jsdom`): jsdom
// replaces the global URL, which breaks `new URL(..., import.meta.url)` in the rest.
// A few tests use Bun APIs (Bun.Glob, Bun.spawnSync), so `npm test`
// runs vitest under Bun (`bunx --bun vitest run`).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'examples/**/*.test.ts'],
  },
})
