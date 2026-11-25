// `merge`: a stored diff back to a whole value.
import { expect, test } from 'vitest'
import { merge } from '@osdlc/spec-query'

const DEFAULTS = { theme: 'light', page: { size: 20, tags: ['a'] } }

test('merge fills in the defaults and ignores keys the defaults lack', () => {
  expect(merge({ page: { size: 50 }, stale: true }, DEFAULTS)).toEqual({
    theme: 'light',
    page: { size: 50, tags: ['a'] },
  })
})

test('merge returns a fresh clone that shares nothing with the defaults', () => {
  const merged = merge({}, DEFAULTS)
  expect(merged).toEqual(DEFAULTS)
  expect(merged.page.tags).not.toBe(DEFAULTS.page.tags)
})
