/**
 * The copy of `harness-knowledge.json` that tradecraft-core embeds must be what `compile` writes
 * for the current corpus. Permalinks carry the commit, so the copy is compiled with the fixed
 * placeholder commit `main` (see `pnpm run compile:embed`) and is the same on every checkout.
 * It is cut to the harnesses and subjects in `embedded-slice.json` and written compact.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { CORPUS_ROOT, loadCorpus } from '../corpus/corpus.ts'
import { compile, readSlice, sliceKnowledge } from './compile.ts'

const DATA = resolve(import.meta.dirname, '../../../packages/rust/tradecraft-core/data')
const EMBEDDED = resolve(DATA, 'harness-knowledge.json')
const SLICE = resolve(DATA, 'embedded-slice.json')

test('the copy tradecraft-core embeds is current', () => {
  const expected = `${JSON.stringify(sliceKnowledge(compile(loadCorpus(CORPUS_ROOT), 'main'), readSlice(SLICE)))}\n`
  assert.equal(
    readFileSync(EMBEDDED, 'utf8'),
    expected,
    'stale: run `pnpm --filter harness-reference run compile:embed` and commit the result',
  )
})
