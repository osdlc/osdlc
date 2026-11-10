import { expect, test } from 'vitest'

// The README example, run through the package name the way a consumer imports it.
import { slugify } from '@osdlc/markdown-vault-astro'

test('README: slugify collapses a title to its filename stem', () => {
  expect(slugify('Maple Street School')).toBe('maple-street-school')
})
