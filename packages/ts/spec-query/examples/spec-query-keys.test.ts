// `specQueryKeys`: the dotted keys the codec owns, to split a route query in two.
import { expect, test } from 'vitest'
import { specQueryKeys } from '@osdlc/spec-query'

const DEFAULTS = { theme: 'light', page: { size: 20, tags: ['a'] } }

test('specQueryKeys lists every dotted key, in defaults order', () => {
  expect(specQueryKeys(DEFAULTS)).toEqual(['theme', 'page.size', 'page.tags'])
})

test('specQueryKeys honours omit, a group omitting its subtree', () => {
  expect(specQueryKeys(DEFAULTS, { omit: ['page'] })).toEqual(['theme'])
})
