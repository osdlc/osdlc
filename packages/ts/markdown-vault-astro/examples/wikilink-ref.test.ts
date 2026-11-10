import { expect, test } from 'vitest'
import { z } from 'zod'

// The README example, run through the package name the way a consumer imports it.
import { wikilinkRef } from '@osdlc/markdown-vault-astro'

test('README: wikilinkRef checks a quoted [[type/slug]] frontmatter value, as a zod 4 schema', () => {
  const schema = z.object({ place: wikilinkRef('location') })

  expect(schema.safeParse({ place: '[[location/city-library]]' }).success).toBe(true)
  expect(schema.safeParse({ place: '[[location/city-library|The Library]]' }).success).toBe(true)
  expect(schema.safeParse({ place: '[[person/ada]]' }).success).toBe(false)
  expect(schema.safeParse({ place: 'location/city-library' }).success).toBe(false)
})
