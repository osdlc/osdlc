import { expect, test } from 'vitest'

import { namesPackage, withoutSource } from '../scripts/check-release.ts'

const compiled = (repo: string, commit: string, path: string, strength = 'strong'): string =>
  JSON.stringify({
    schema: 1,
    corpus: { repo, path, commit },
    values: [
      {
        harness: 'codex',
        subject: 'cli/binary',
        strength,
        basis: `https://github.com/${repo}/blob/${commit}/${path}/statements/Codex/Binary.md`,
      },
    ],
  })

test('withoutSource leaves out the repository, commit and folder, and nothing else', () => {
  const here = compiled('osdlc/osdlc', 'aaa', 'packages/corpora/harness-reference/corpus')
  const there = compiled('osdlc/skillwright', 'bbb', 'harness-reference/corpus')
  expect(withoutSource(here)).toBe(withoutSource(there))
  expect(withoutSource(here)).toContain('"basis": "statements/Codex/Binary.md"')
  const weaker = compiled('osdlc/osdlc', 'aaa', 'packages/corpora/harness-reference/corpus', 'weak')
  expect(withoutSource(weaker)).not.toBe(withoutSource(here))
})

test('withoutSource refuses a basis outside the corpus the file names', () => {
  const k = JSON.parse(compiled('osdlc/osdlc', 'aaa', 'corpus')) as { corpus: { commit: string } }
  k.corpus.commit = 'ccc'
  expect(() => withoutSource(JSON.stringify(k))).toThrow(/outside the corpus/)
})

test('namesPackage reads the front matter only', () => {
  const name = '@osdlc/harness-knowledge'
  expect(namesPackage(`---\n"${name}": patch\n---\n\nFix.\n`, name)).toBe(true)
  expect(namesPackage(`---\n"@osdlc/other": patch\n---\n\nMentions ${name}: here.\n`, name)).toBe(
    false,
  )
})
