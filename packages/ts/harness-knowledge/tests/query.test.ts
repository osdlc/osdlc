import { expect, test } from 'vitest'

import { fact } from '../src/index.js'

test('fact returns an object value stated at moderate strength or better', () => {
  expect(fact('codex', 'skills/user-dirs')).toMatchObject({ dirs: ['~/.agents/skills'] })
})

test('fact skips weak values, missing values and unknown harnesses', () => {
  expect(fact('claude-code', 'mcp/config-file')).toBeUndefined() // weak
  expect(fact('codex', 'instructions/claude-md')).toBeUndefined() // not stated
  expect(fact('no-such-harness', 'cli/binary')).toBeUndefined()
})

test('fact ignores an accept option smuggled into the query', () => {
  const query = { accept: { weak: true, disputed: true } } as Parameters<typeof fact>[2]
  expect(fact('claude-code', 'mcp/config-file', query)).toBeUndefined() // weak
})
