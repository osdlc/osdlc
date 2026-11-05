import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { validateCorpus } from './validate.ts'

const SCHEMA = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 1 },
    site: { type: 'string', format: 'uri' },
    partner: { type: 'string', 'x-ref': 'note' },
    friends: { type: 'array', items: { type: 'string' }, 'x-ref': 'note' },
  },
})

const MANIFEST = `markdown-db: 0
types:
  note:
    path: notes/{id}.md
    schema: note.schema.json
  tag:
    path: tags/{id}.yaml
    schema: note.schema.json
  card:
    path: cards/{id}.json
    schema: note.schema.json
`

let dir = ''
const put = (rel: string, text: string): void => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), text)
}
const note = (fields = '', body = 'Body.\n'): string => `---\nname: A\n${fields}---\n\n${body}`
const has = (errors: string[], part: string): boolean => errors.some((e) => e.includes(part))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'markdown-db-'))
  put('markdown-db.yaml', MANIFEST)
  put('note.schema.json', SCHEMA)
  put('notes/a.md', note())
  put('tags/t.yaml', 'name: T\n')
  put('cards/c.json', '{"name": "C"}\n')
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('validateCorpus', () => {
  test('a valid corpus passes, in all three formats', () => {
    const { entries, errors } = validateCorpus(dir)
    assert.deepEqual(errors, [])
    assert.equal(entries.get('note')?.size, 1)
    assert.equal(entries.get('tag')?.size, 1)
    assert.equal(entries.get('card')?.size, 1)
  })

  test('an empty body passes', () => {
    put('notes/a.md', note('', ''))
    assert.deepEqual(validateCorpus(dir).errors, [])
  })

  test('an unknown field fails', () => {
    put('notes/a.md', note('colour: blue\n'))
    assert.ok(has(validateCorpus(dir).errors, 'notes/a.md: colour: unknown field'))
  })

  test('a bad URL fails', () => {
    put('notes/a.md', note('site: not a url\n'))
    assert.ok(has(validateCorpus(dir).errors, 'site'))
  })

  test('a missing field fails', () => {
    put('tags/t.yaml', 'site: "https://example.com"\n')
    assert.ok(has(validateCorpus(dir).errors, 'tags/t.yaml: name: required'))
  })

  test('a dangling x-ref fails; an existing one passes', () => {
    put('notes/b.md', note('partner: missing\n'))
    assert.ok(has(validateCorpus(dir).errors, 'partner: "missing" is not a note'))
    put('notes/b.md', note('partner: a\n'))
    assert.deepEqual(validateCorpus(dir).errors, [])
  })

  test('each item of an array x-ref is checked', () => {
    put('notes/b.md', note('friends: [a, nope]\n'))
    const errors = validateCorpus(dir).errors
    assert.ok(has(errors, '"nope" is not a note'))
    assert.ok(!has(errors, '"a" is not'))
  })

  test('an x-ref to an unknown type fails', () => {
    put('note.schema.json', SCHEMA.replace('"x-ref":"note"', '"x-ref":"ghost"'))
    assert.ok(has(validateCorpus(dir).errors, 'unknown type "ghost"'))
  })

  test('a file not matching the path pattern fails; files outside every type are ignored', () => {
    put('notes/a.txt', 'x')
    put('elsewhere/x.txt', 'x')
    const errors = validateCorpus(dir).errors
    assert.ok(has(errors, 'notes/a.txt: path'))
    assert.ok(!has(errors, 'elsewhere'))
  })

  test('a bad id spelling fails', () => {
    put('notes/Bad_Id.md', note())
    assert.ok(has(validateCorpus(dir).errors, 'notes/Bad_Id.md: id'))
  })

  test('a .md file with no frontmatter fence fails', () => {
    put('notes/a.md', 'just text\n')
    assert.ok(has(validateCorpus(dir).errors, 'no frontmatter block'))
  })

  test('a .json entry that is not an object fails', () => {
    put('cards/c.json', '[1, 2]\n')
    assert.ok(has(validateCorpus(dir).errors, 'cards/c.json: record must be a mapping'))
  })

  test('a pattern with an unsupported extension fails', () => {
    put('markdown-db.yaml', MANIFEST.replace('tags/{id}.yaml', 'tags/{id}.toml'))
    assert.ok(has(validateCorpus(dir).errors, 'types.tag.path: extension'))
  })

  test('a missing manifest fails', () => {
    rmSync(join(dir, 'markdown-db.yaml'))
    assert.ok(has(validateCorpus(dir).errors, 'markdown-db.yaml: not found'))
  })
})

describe('corpora/beta', () => {
  test('validates', () => {
    const { entries, errors } = validateCorpus(resolve(import.meta.dirname, '../../corpora/beta'))
    assert.deepEqual(errors, [])
    assert.ok((entries.get('harness')?.size ?? 0) > 0)
  })
})
