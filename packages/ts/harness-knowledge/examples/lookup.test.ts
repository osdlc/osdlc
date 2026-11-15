// The README's lookup example, run through the package name.
import { expect, test } from 'vitest'

import { loadKnowledge, lookup } from '@osdlc/harness-knowledge'

test('look up a harness fact and its basis', () => {
  const found = lookup(loadKnowledge(), 'codex', 'skills/user-dirs')
  expect(found?.strength).toBe('strong')
  expect(found?.basis).toMatch(/^https:\/\//)
})
