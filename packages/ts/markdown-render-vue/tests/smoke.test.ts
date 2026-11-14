import { expect, test } from 'vitest'

// Imports the package by name, the way a consumer does, so the `exports` map is exercised.
import * as pkg from '@osdlc/markdown-render-vue'

test('the package entry loads and exports something', () => {
  expect(Object.keys(pkg).length).toBeGreaterThan(0)
})

test('the injection keys a host provides and injects outside setup are exported', () => {
  expect(typeof pkg.NoteSourceKey).toBe('symbol')
  expect(typeof pkg.EmbedAncestorsKey).toBe('symbol')
})
