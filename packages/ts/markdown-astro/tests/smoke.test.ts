import { expect, test } from 'vitest'

// Imports the package by name, the way a consumer does, so the `exports` map is exercised.
import * as pkg from '@osdlc/markdown-astro'

test('the package entry loads and exports something', () => {
  expect(Object.keys(pkg).length).toBeGreaterThan(0)
})
