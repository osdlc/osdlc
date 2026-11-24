import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'vitest'

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import ts from 'typescript'
import { generateTypes, loadCorpus } from '../src/index.ts'

const CLI = join(import.meta.dirname, '../bin/corpus-schema.js')

let dir = ''
const put = (rel: string, text: string): void => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), text)
}
const cli = (...args: string[]) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8' })
  return { status: r.status, stdout: r.stdout, stderr: r.stderr }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'corpus-schema-types-'))
  put('c/c.corpus-schema.yaml', 'corpus-schema: 0\nid: c\nformats: [md]\n')
  put(
    'c/base-notes/base-notes.schema.json',
    JSON.stringify({
      description: 'A note.',
      required: ['title'],
      properties: { title: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } },
    }),
  )
  put(
    'c/claims/claims.schema.json',
    JSON.stringify({
      'x-extends': 'base-notes',
      required: ['verdict'],
      properties: {
        verdict: { enum: ['true', 'false'] },
        source: { 'x-ref': 'base-notes', type: 'string' },
        see: { type: 'array', items: { 'x-ref': ['base-notes', 'claims'], type: 'string' } },
        'odd-key': { type: ['integer', 'null'] },
      },
    }),
  )
  put('c/base-notes/A.md', '---\ntitle: A\n---\n')
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('field types', () => {
  const typeOf = (schema: unknown): string => {
    put('f/f.corpus-schema.yaml', 'corpus-schema: 0\nid: f\nformats: [md]\n')
    put('f/t/t.schema.json', JSON.stringify({ required: ['x'], properties: { x: schema } }))
    const out = generateTypes(loadCorpus(join(dir, 'f')))
    return /\n {2}x: (.*)\n/.exec(out)?.[1] ?? out
  }
  test('maps the common keywords', () => {
    assert.equal(typeOf({ type: 'string' }), 'string')
    assert.equal(typeOf({ const: 'x' }), '"x"')
    assert.equal(typeOf({ type: ['integer', 'null'] }), 'number | null')
    assert.equal(typeOf({ type: 'array', items: { enum: [1, 'a'] } }), '(1 | "a")[]')
    assert.equal(
      typeOf({ type: 'object', properties: { a: { type: 'boolean' } }, required: ['a'] }),
      '{ a: boolean; [key: string]: unknown }',
    )
    assert.equal(
      typeOf({ type: 'object', additionalProperties: false, properties: { a: {} } }),
      '{ a?: unknown }',
    )
    assert.equal(typeOf({ anyOf: [{ type: 'string' }, { type: 'null' }] }), 'string | null')
    assert.equal(typeOf({ allOf: [{ type: 'string' }, { minLength: 1 }] }), 'string')
    assert.equal(
      typeOf({ type: 'object', properties: { a: {} }, anyOf: [{ type: 'object' }] }),
      '{ a?: unknown; [key: string]: unknown } & Record<string, unknown>',
    )
    assert.equal(
      typeOf({ properties: { a: {} }, anyOf: [{ type: 'object' }, { type: 'null' }] }),
      'Record<string, unknown> | null',
    )
    assert.equal(
      typeOf({ type: 'array', prefixItems: [{ type: 'string' }], items: false }),
      '[string]',
    )
    assert.equal(typeOf({ $ref: '#/$defs/x' }), 'unknown')
    assert.equal(typeOf(true), 'unknown')
    assert.equal(
      typeOf({ type: 'array', prefixItems: [{ type: 'string' }], items: { type: 'number' } }),
      '[string, ...number[]]',
    )
  })
})

describe('generateTypes', () => {
  test('one interface per type, with inherited fields and refs', () => {
    const out = generateTypes(loadCorpus(join(dir, 'c')))
    assert.match(
      out,
      /export interface BaseNotes \{\n {2}title: string\n {2}tags\?: string\[\]\n\}/,
    )
    const claims = out.slice(out.indexOf('export interface Claims'))
    assert.match(claims, /title: string/)
    assert.match(claims, /verdict: "true" \| "false"/)
    assert.match(claims, /source\?: Ref<"base-notes">/)
    assert.match(claims, /see\?: Ref<"base-notes" \| "claims">\[\]/)
    assert.match(claims, /"odd-key"\?: number \| null/)
    assert.match(out, /export interface CorpusTypes \{\n {2}"base-notes": BaseNotes\n/)
    assert.match(out, /\/\*\*\n \* A note\.\n \*\/\nexport interface BaseNotes/)
  })
})

describe('generated module', () => {
  test('compiles, for schemas that stress the index signature, nulls and refs', () => {
    put('g/g.corpus-schema.yaml', 'corpus-schema: 0\nid: g\nformats: [md]\n')
    put('g/a/a.schema.json', JSON.stringify({ properties: { n: { type: 'string' } } }))
    put(
      'g/b/b.schema.json',
      JSON.stringify({
        properties: {
          m: {
            type: 'object',
            properties: { name: { type: 'string' } },
            additionalProperties: { type: 'number' },
          },
          v: {
            type: ['object', 'null'],
            anyOf: [
              { properties: { kind: { const: 'a' } } },
              { properties: { kind: { const: 'b' } } },
            ],
          },
          next: { type: ['string', 'null'], 'x-ref': 'a' },
          nexts: { type: ['array', 'null'], items: { type: 'string', 'x-ref': 'a' } },
        },
      }),
    )
    const source = generateTypes(loadCorpus(join(dir, 'g')))
    assert.match(
      source,
      /m\?: \{ name\?: string; \[key: string\]: number \| string \| undefined \}/,
    )
    assert.match(source, /next\?: Ref<"a"> \| null/)
    assert.match(source, /nexts\?: Ref<"a">\[\] \| null/)
    assert.match(source, /v\?: Record<string, unknown> \| null\n/)
    const file = join(dir, 'g.d.ts')
    writeFileSync(file, source)
    const program = ts.createProgram([file], { noEmit: true, strict: true, types: [] })
    const errors = ts
      .getPreEmitDiagnostics(program)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
    assert.deepEqual(errors, [])
  })
})

describe('type names', () => {
  test('a type named like a global stays compilable', () => {
    put('r/r.corpus-schema.yaml', 'corpus-schema: 0\nid: r\nformats: [md]\n')
    put('r/record/record.schema.json', '{"properties":{"x":{"type":"object"}}}')
    const out = generateTypes(loadCorpus(join(dir, 'r')))
    assert.match(out, /export interface Record2 \{\n {2}x\?: Record<string, unknown>/)
  })
})

describe('corpus-schema types', () => {
  test('prints to stdout, or writes --out', () => {
    const r = cli('types', 'c')
    assert.equal(r.status, 0)
    assert.match(r.stdout, /export interface Claims/)
    const w = cli('types', '--out', 'out.d.ts', 'c')
    assert.equal(w.status, 0)
    assert.equal(w.stdout, '')
    assert.equal(readFileSync(join(dir, 'out.d.ts'), 'utf8'), r.stdout)
  })

  test('fails with no corpus, with a usage error on bad arguments', () => {
    mkdirSync(join(dir, 'empty'))
    assert.equal(cli('types', 'empty').status, 1)
    assert.equal(cli('types').status, 2)
    assert.equal(cli('types', '--out', 'c', 'c').status, 1)
    assert.equal(cli('validate', '--out', 'x', 'c').status, 2)
  })
})
