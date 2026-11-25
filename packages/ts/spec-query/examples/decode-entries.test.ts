// `decodeEntries`: raw pairs back to a whole value, as `Object.entries` of a router query.
import { expect, test } from 'vitest'
import { decodeEntries } from '@osdlc/spec-query'

const DEFAULTS = { q: '', size: 20, tags: ['a'] }

test('decodeEntries reads pairs against the types the defaults imply', () => {
  const query = { size: '50', tags: 'x,y', unknown: 'ignored' }
  expect(decodeEntries(Object.entries(query), DEFAULTS)).toEqual({
    q: '',
    size: 50,
    tags: ['x', 'y'],
  })
})

test('decodeEntries is total: a value that will not parse falls back to the default', () => {
  expect(decodeEntries([['size', 'lots']], DEFAULTS)).toEqual(DEFAULTS)
})
