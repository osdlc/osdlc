// `diff`: store only what differs from the defaults. Imported by package name, as a consumer does.
import { expect, test } from 'vitest'
import { diff } from '@osdlc/spec-query'

const DEFAULTS = { theme: 'light', page: { size: 20, tags: ['a'] } }

test('diff keeps only what differs, recursively', () => {
  expect(diff({ theme: 'dark', page: { size: 20, tags: ['a'] } }, DEFAULTS)).toEqual({
    theme: 'dark',
  })
  expect(diff({ theme: 'light', page: { size: 50, tags: ['a'] } }, DEFAULTS)).toEqual({
    page: { size: 50 },
  })
})

test('diff is {} when nothing differs, and arrays compare whole', () => {
  expect(diff(DEFAULTS, DEFAULTS)).toEqual({})
  expect(diff({ ...DEFAULTS, page: { size: 20, tags: ['a', 'b'] } }, DEFAULTS)).toEqual({
    page: { tags: ['a', 'b'] },
  })
})
