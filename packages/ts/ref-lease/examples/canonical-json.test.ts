// Equal payloads encode to equal bytes, whatever the key order.

import { expect, test } from 'vitest'

import { canonicalJson } from '@osdlc/ref-lease'

test('key order does not change the encoding', () => {
  const a = canonicalJson({ holder: 'worker-a', ttl: 300, tags: ['ci'] })
  const b = canonicalJson({ tags: ['ci'], ttl: 300, holder: 'worker-a' })
  expect(a).toBe('{"holder":"worker-a","tags":["ci"],"ttl":300}')
  expect(b).toBe(a)
})
