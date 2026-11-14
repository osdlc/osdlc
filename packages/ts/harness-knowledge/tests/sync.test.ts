import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import { problems, syncFrom, withoutSource } from '../scripts/sync.ts'

const dirs: string[] = []
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'hk-sync-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

test('syncFrom copies both files unchanged', () => {
  const from = tmp()
  const to = tmp()
  writeFileSync(join(from, 'harness-knowledge.json'), '{"schema":1}\n')
  writeFileSync(join(from, 'harness-knowledge.schema.json'), '{}\n')
  syncFrom(from, to)
  expect(readFileSync(join(to, 'harness-knowledge.json'), 'utf-8')).toBe('{"schema":1}\n')
})

test('a missing file, bad JSON or another schema number is refused', () => {
  const from = tmp()
  expect(problems(from)).toHaveLength(2)
  writeFileSync(join(from, 'harness-knowledge.json'), '{"schema":2}')
  writeFileSync(join(from, 'harness-knowledge.schema.json'), 'nope')
  expect(problems(from)).toHaveLength(2)
  expect(() => syncFrom(from, tmp())).toThrow()
})

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
