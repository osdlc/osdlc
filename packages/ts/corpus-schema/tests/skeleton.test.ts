import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { beforeEach, describe, test } from 'vitest'

import { newRecord, recordSkeleton } from '../src/index.ts'
import { scratch } from './corpora.ts'

const { put, root, report, at } = scratch('skeleton')

const CLAIMS = `type: object
required: [id, status, claim, evidence]
properties:
  id: { type: string }
  status: { enum: [draft, accepted] }
  claim:
    type: object
    required: [text, agent]
    properties:
      text: { type: string }
      agent:
        type: object
        required: [kind, rank]
        properties:
          kind: { const: person }
          rank: { type: integer, default: 3 }
  evidence:
    type: array
    minItems: 1
    items:
      type: object
      required: [direction]
      properties:
        direction: { enum: [supports, refutes] }
  tags: { type: array }
`

describe('recordSkeleton', () => {
  beforeEach(() => {
    root('c')
    put('c/claims/claims.schema.yaml', CLAIMS)
  })

  test('builds every required field: const, default, enum placeholders and nested objects', () => {
    assert.deepEqual(recordSkeleton(at('c'), 'claims'), {
      id: '',
      status: '<draft | accepted>',
      claim: { text: '', agent: { kind: 'person', rank: 3 } },
      evidence: [{ direction: '<supports | refutes>' }],
    })
  })

  test('follows x-extends, the furthest type first, and uses', () => {
    put(
      'c/extra/extra.schema.yaml',
      'x-extends: claims\nrequired: [source]\nproperties:\n  source: { type: string }\n',
    )
    assert.deepEqual(Object.keys(recordSkeleton(at('c'), 'extra')), [
      'id',
      'status',
      'claim',
      'evidence',
      'source',
    ])
    root('d', { extends: { p: '../c' }, uses: ['p/claims'] })
    put('d/claims/_notes/n.md', 'The folder a used type needs.\n')
    assert.deepEqual(recordSkeleton(at('d'), 'claims'), recordSkeleton(at('c'), 'claims'))
  })

  test('follows a local $ref, and stops a recursive one', () => {
    put(
      'c/refs/refs.schema.yaml',
      'type: object\nrequired: [a]\n$defs:\n  n: { type: object, required: [next], properties: { next: { $ref: "#/$defs/n" } } }\nproperties:\n  a: { $ref: "#/$defs/n" }\n',
    )
    assert.ok(recordSkeleton(at('c'), 'refs'))
  })

  test('throws for an unknown type', () => {
    assert.throws(() => recordSkeleton(at('c'), 'nope'), /nope: no such type.*claims/)
  })
})

describe('newRecord', () => {
  beforeEach(() => {
    root('c')
    put('c/claims/claims.schema.yaml', CLAIMS)
  })

  test('writes the skeleton as <type>/<id>.md, with the id set', () => {
    assert.equal(newRecord(at('c'), 'claims', 'C-1'), 'claims/C-1.md')
    const text = readFileSync(at('c/claims/C-1.md'), 'utf8')
    assert.match(text, /^---\nid: C-1\nstatus: <draft \| accepted>\n/)
    assert.match(text, /\n---\n$/)
  })

  test('a folder record is <type>/<id>/<id>.md, or the x-record-file', () => {
    assert.equal(newRecord(at('c'), 'claims', 'C-2', { folder: true }), 'claims/C-2/C-2.md')
    put('c/docs/docs.schema.yaml', 'x-record-file: README.md\n')
    assert.equal(newRecord(at('c'), 'docs', 'D', { folder: true }), 'docs/D/README.md')
    assert.deepEqual(
      report('c').errors.filter((e) => e.startsWith('docs/')),
      [],
    )
  })

  test('uses the corpus format: yaml when md is not allowed, json', () => {
    root('y', { extra: 'formats: [yaml]\n' })
    put(
      'y/claims/claims.schema.yaml',
      'type: object\nrequired: [n]\nproperties:\n  n: { type: integer }\n',
    )
    assert.equal(newRecord(at('y'), 'claims', 'A'), 'claims/A.yaml')
    assert.equal(readFileSync(at('y/claims/A.yaml'), 'utf8'), 'n: 0\n')
    root('j', { extra: 'formats: [json]\n' })
    put('j/claims/claims.schema.json', '{"required":["n"],"properties":{"n":{"type":"string"}}}')
    newRecord(at('j'), 'claims', 'A')
    assert.equal(readFileSync(at('j/claims/A.json'), 'utf8'), '{\n  "n": ""\n}\n')
  })

  test('refuses a bad id, an id off the x-id-pattern, and a taken id', () => {
    assert.throws(() => newRecord(at('c'), 'claims', 'a/b'), /id: "a\/b" holds "\/"/)
    put('c/pat/pat.schema.yaml', 'x-id-pattern: "^P-[0-9]{4}$"\n')
    assert.throws(() => newRecord(at('c'), 'pat', 'X-1'), /does not match x-id-pattern/)
    newRecord(at('c'), 'pat', 'P-0001')
    assert.throws(() => newRecord(at('c'), 'pat', 'P-0001'), /already exists|is also/)
    assert.ok(!existsSync(at('c/pat/X-1.md')))
  })

  test('with values, merges them over the skeleton and validates before writing', () => {
    const values = {
      status: 'accepted',
      claim: { text: 'It rains.' },
      evidence: [{ direction: 'supports' }],
    }
    assert.equal(newRecord(at('c'), 'claims', 'C-3', { values }), 'claims/C-3.md')
    assert.deepEqual(report('c').errors, [])
    assert.throws(
      () => newRecord(at('c'), 'claims', 'C-4', { values: { ...values, status: 'maybe' } }),
      /claims\/C-4\.md: status: must be equal to one of the allowed values/,
    )
    assert.ok(!existsSync(at('c/claims/C-4.md')))
    // An unfilled enum placeholder is not a valid value.
    assert.throws(() => newRecord(at('c'), 'claims', 'C-5', { values: { claim: { text: 'x' } } }))
  })
})
