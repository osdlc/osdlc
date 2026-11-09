import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { validateCorpus } from '@osdlc/corpus-schema'
import { parse } from 'yaml'

import { canonicalJson, normalizeUrl } from './corpus.ts'

const beta = resolve(import.meta.dirname, '../../corpora/beta')

describe('corpora/beta', () => {
  test('validates with no warnings', () => {
    const { records, errors, warnings } = validateCorpus(beta)
    assert.deepEqual(errors, [])
    assert.deepEqual(warnings, [])
    assert.equal(records.get('harnesses')?.size, 14)
    assert.equal(records.get('documents')?.size, 57)
    assert.equal(records.get('study-results')?.size, 35)
    assert.equal(records.get('methods')?.size, 2)
    assert.equal(records.get('subjects')?.size, 8)
    assert.equal(records.get('statements')?.size, 30)
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

  test('refuses a source that is not a document, and study results missing what its kind needs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-reference-beta-'))
    try {
      cpSync(beta, dir, { recursive: true })
      const edit = (rel: string, from: string, to: string): void => {
        const file = join(dir, rel)
        writeFileSync(file, readFileSync(file, 'utf8').replace(from, to))
      }
      edit(
        'harnesses/Amp.md',
        '../documents/Amp%20Frontier%20Corporation/Amp%20manual.md',
        'Kiro.md',
      )
      const evidence = (name: string, data: string): void =>
        writeFileSync(join(dir, 'study-results', `${name}.md`), `---\n${data}\n---\n`)
      const harness =
        'harness: "[Kiro](../harnesses/Kiro.md)"\nobserved: 2026-11-08\ncontributions: [{contributor: {name: x, agentType: person}, activityType: created, date: 2026-11-08T00:00:00Z}]'
      evidence('2026-11-08 no document', `kind: docs\n${harness}`)
      evidence('2026-11-08 no basis', `kind: help-text\nversion: 1.2.3\n${harness}`)
      evidence('no date', `kind: inferred\n${harness}`)
      const { errors } = validateCorpus(dir)
      const has = (part: string): boolean => errors.some((e) => e.includes(part))
      assert.ok(
        has('harnesses/Amp.md: sources: harnesses/Kiro.md is not a documents record'),
        errors.join('\n'),
      )
      assert.ok(has('study-results/2026-11-08 no document.md: reportedIn: required'))
      // dependentRequired reports at the record, not the field.
      assert.ok(
        has('study-results/2026-11-08 no basis.md: (data): must have property version_basis'),
      )
      assert.ok(has('study-results/no date.md: id: "no date" does not match x-id-pattern'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('shared helpers', () => {
  test('canonicalJson ignores object key order at every depth and keeps array order', () => {
    assert.equal(
      canonicalJson({ a: 1, b: { y: 1, x: [1, { d: 1, c: 2 }] } }),
      canonicalJson({ b: { x: [1, { c: 2, d: 1 }], y: 1 }, a: 1 }),
    )
    assert.notEqual(canonicalJson({ a: [1, 2] }), canonicalJson({ a: [2, 1] }))
  })
  test('normalizeUrl drops surrounding space and trailing slashes', () => {
    assert.equal(normalizeUrl(' https://x.test/a// '), 'https://x.test/a')
  })
})

describe('documents.schema.md doi', () => {
  const schema = readFileSync(join(beta, 'documents/documents.schema.md'), 'utf8')
  const pattern = new RegExp(
    String(parse(/^---\n([\s\S]*?)\n---/u.exec(schema)?.[1] ?? '').properties.doi.pattern),
    'u',
  )
  test('accepts real DOIs and refuses malformed ones', () => {
    for (const ok of [
      '10.1000/xyz123',
      '10.1234.5/a-b_c.d',
      '10.1002/(SICI)1097-4571(199806)49:8<693::AID-ASI4>3.0.CO;2-O',
    ])
      assert.ok(pattern.test(ok), ok)
    for (const bad of [
      '10x123/example',
      '10.123/ex ample',
      '10.123/',
      '10.123/ok junk',
      'doi:10.123/x',
    ])
      assert.ok(!pattern.test(bad), bad)
  })
})
