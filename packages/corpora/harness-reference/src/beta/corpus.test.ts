import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { validateCorpus } from '@osdlc/markdown-db'

const beta = resolve(import.meta.dirname, '../../corpora/beta')

describe('corpora/beta', () => {
  test('validates with no warnings', () => {
    const { records, errors, warnings } = validateCorpus(beta)
    assert.deepEqual(errors, [])
    assert.deepEqual(warnings, [])
    assert.equal(records.get('harnesses')?.size, 14)
  })

  test('refuses a license on a closed-source harness, and a successor that is not a harness', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-reference-beta-'))
    try {
      cpSync(beta, dir, { recursive: true })
      const edit = (rel: string, from: string, to: string): void => {
        const file = join(dir, rel)
        writeFileSync(file, readFileSync(file, 'utf8').replace(from, to))
      }
      edit('harnesses/Claude Code.md', 'open_source: false\n', 'open_source: false\nlicense: MIT\n')
      edit('harnesses/Gemini CLI.md', '(Antigravity.md)', '(../README.md)')
      const { errors } = validateCorpus(dir)
      const has = (part: string): boolean => errors.some((e) => e.includes(part))
      assert.ok(has('harnesses/Claude Code.md: license: not allowed here'), errors.join('\n'))
      assert.ok(has('harnesses/Gemini CLI.md: successor: README.md is not a harnesses record'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
