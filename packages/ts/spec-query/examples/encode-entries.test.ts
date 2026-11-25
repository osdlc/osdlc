// `encodeEntries`: the diff as raw pairs, for a router that owns the percent-encoding.
import { expect, test } from 'vitest'
import { encodeEntries, type SpecEntry } from '@osdlc/spec-query'

const DEFAULTS = { q: '', tags: ['a'], pinned: null as string | null }

test('encodeEntries gives raw text, nothing escaped', () => {
  const entries: SpecEntry[] = encodeEntries({ ...DEFAULTS, q: '100% & rising' }, DEFAULTS)
  expect(entries).toEqual([{ key: 'q', value: '100% & rising' }])
})

test('encodeEntries joins arrays unless an element holds a comma', () => {
  expect(encodeEntries({ ...DEFAULTS, tags: ['a', 'b'] }, DEFAULTS)).toEqual([
    { key: 'tags', value: 'a,b' },
  ])
  expect(encodeEntries({ ...DEFAULTS, tags: ['a,b', 'c'] }, DEFAULTS)).toEqual([
    { key: 'tags', value: ['a,b', 'c'] },
  ])
})
