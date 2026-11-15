import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import { syncCorpus } from '../src/sync.ts'
import { scratch } from './corpora.ts'

const { at, put, root, report, errors, warnings } = scratch('records')

/** A corpus `c` with a principles type whose ids are `P-` and four digits. */
const principles = (extra = ''): void => {
  root('c')
  put('c/principles/principles.schema.yaml', `type: object\nx-id-pattern: "^P-[0-9]{4}$"\n${extra}`)
}

describe('ids from x-id-pattern', () => {
  test('the id is the longest part of the stem, ending before a -, that the pattern matches', () => {
    principles()
    put('c/principles/P-0002-be-kind.md', '---\n---\n')
    put('c/principles/P-0003.md', '---\n---\n')
    const r = report()
    assert.deepEqual(r.errors, [])
    assert.deepEqual([...(r.records.get('principles')?.keys() ?? [])].sort(), ['P-0002', 'P-0003'])
    assert.equal(r.files.get('principles')?.get('P-0002'), 'principles/P-0002-be-kind.md')
  })

  test('a stem with no matching part is an error, and two files with one id collide', () => {
    principles()
    put('c/principles/Q-0001-x.md', '---\n---\n')
    put('c/principles/P-0002-a.md', '---\n---\n')
    put('c/principles/P-0002-b.md', '---\n---\n')
    assert.deepEqual(errors().sort(), [
      'principles/P-0002-b.md: id: "P-0002" is also principles/P-0002-a.md',
      'principles/Q-0001-x.md: id: "Q-0001-x" does not match x-id-pattern ^P-[0-9]{4}$',
    ])
  })

  test('a pattern the whole stem matches keeps the whole stem as the id', () => {
    root('c')
    put('c/notes/notes.schema.yaml', 'type: object\nx-id-pattern: "^[A-Z]"\n')
    put('c/notes/Be-Kind-Today.md', '---\n---\n')
    assert.deepEqual([...(report().records.get('notes')?.keys() ?? [])], ['Be-Kind-Today'])
  })

  test('a reference by id names a record by its id or its whole stem', () => {
    principles()
    put('c/principles/P-0002-be-kind.md', '---\n---\n')
    put(
      'c/notes/notes.schema.yaml',
      'type: object\nproperties:\n  see: { type: array, items: { type: string, x-ref: principles, x-ref-form: wikilink } }\n',
    )
    put('c/notes/N.md', '---\nsee: ["[[P-0002]]", "[[P-0002-be-kind]]", "[[p-0002]]"]\n---\n')
    assert.deepEqual(errors(), [])
  })

  test("the data's id, when present, must be the record's id", () => {
    principles()
    put('c/principles/P-0002-be-kind.md', '---\nid: P-0002\n---\n')
    put('c/principles/P-0003-x.md', '---\nid: P-0004\n---\n')
    put('c/principles/P-0005-x.md', '---\nid: 5\n---\n')
    const r = report()
    assert.deepEqual(r.errors.sort(), [
      `principles/P-0003-x.md: id: must be the record's id, "P-0003"`,
      `principles/P-0005-x.md: id: must be the record's id, "P-0005"`,
    ])
    assert.deepEqual([...(r.records.get('principles')?.keys() ?? [])], ['P-0002'])
  })
})

describe('wikilinks by id', () => {
  test('a wikilink that matches no file names a record by id', () => {
    principles()
    put('c/principles/P-0002-be-kind.md', '---\n---\n')
    put('c/notes/notes.schema.yaml', 'type: object\n')
    put('c/notes/N.md', 'See [[P-0002]] and [[P-0002#Why|why]].\n')
    const r = report()
    assert.deepEqual(r.errors, [])
    assert.equal(r.warnings.length, 2)
  })

  test('an id two records share is ambiguous', () => {
    principles()
    put('c/principles/P-0002-be-kind.md', '---\n---\n')
    put('c/rules/rules.schema.yaml', 'type: object\nx-id-pattern: "^P-[0-9]{4}$"\n')
    put('c/rules/P-0002-review.md', '---\n---\n')
    put('c/notes/notes.schema.yaml', 'type: object\n')
    put('c/notes/N.md', 'See [[P-0002]].\n')
    assert.deepEqual(errors(), [
      'notes/N.md: body: [[P-0002]]: ambiguous, the id of principles/P-0002-be-kind.md, rules/P-0002-review.md',
    ])
  })

  test("a referenced corpus's record by id is a link into its copy", () => {
    root('org', { level: 1 })
    put('org/principles/principles.schema.yaml', 'x-id-pattern: "^P-[0-9]{4}$"\n')
    put('org/principles/P-0002-be-kind.md', '---\n---\n')
    root('c', { references: { org: '../org' } })
    put('c/notes/notes.schema.yaml', 'type: object\n')
    put('c/notes/N.md', 'See [[P-0002]].\n')
    assert.deepEqual(errors(), [
      '_references/org: (copy): missing, and a file links into it; run corpus-schema sync',
    ])
    assert.deepEqual(syncCorpus(at('c')).errors, [])
    assert.deepEqual(errors(), [])
  })
})

describe('x-record-file', () => {
  test('a folder holding the named file is a record folder, its id from the folder name', () => {
    principles('x-record-file: README.md\n')
    put('c/principles/README.md', 'The type, documented.\n')
    put('c/principles/P-0002-be-kind/README.md', '---\nid: P-0002\n---\n')
    put('c/principles/P-0002-be-kind/examples/Daily.md', 'Not a record.\n')
    put('c/principles/P-0002-be-kind/evidence/README.md', 'Not a record folder.\n')
    put('c/principles/P-0003-ship-small.md', '---\n---\n')
    const r = report()
    assert.deepEqual(r.errors, [])
    assert.deepEqual(
      r.files.get('principles')?.get('P-0002'),
      'principles/P-0002-be-kind/README.md',
    )
    assert.equal(r.records.get('principles')?.size, 2)
  })

  test('a record file named for its folder is one record', () => {
    principles('x-record-file: P-0002.md\n')
    put('c/principles/P-0002/P-0002.md', '---\n---\n')
    const r = report()
    assert.deepEqual(r.errors, [])
    assert.equal(r.files.get('principles')?.get('P-0002'), 'principles/P-0002/P-0002.md')
  })

  test('a record folder holds one record file', () => {
    principles('x-record-file: README.md\n')
    put('c/principles/P-0002/README.md', '---\n---\n')
    put('c/principles/P-0002/P-0002.md', '---\n---\n')
    assert.deepEqual(errors(), [
      'principles/P-0002/README.md: (file): a record folder holds one record file, and principles/P-0002/P-0002.md is one',
    ])
  })

  test('the value must be a file name with a record extension, at the schema root', () => {
    root('c')
    put('c/a/a.schema.yaml', 'type: object\nx-record-file: docs/README.md\n')
    put('c/b/b.schema.yaml', 'type: object\nx-record-file: README.txt\n')
    put('c/d/d.schema.yaml', 'type: object\nproperties:\n  x: { x-record-file: README.md }\n')
    assert.deepEqual(errors().sort(), [
      'a/a.schema.yaml: x-record-file: must be a file name with a .md, .yaml or .json extension, such as README.md',
      'b/b.schema.yaml: x-record-file: must be a file name with a .md, .yaml or .json extension, such as README.md',
      'd/d.schema.yaml: properties.x: x-record-file sits only at the schema root',
    ])
  })

  test('a type that extends or uses a parent type takes its x-record-file', () => {
    root('sdlc')
    put(
      'sdlc/decisions/decisions.schema.yaml',
      'type: object\nx-id-pattern: "^D-[0-9]{4}$"\nx-record-file: README.md\n',
    )
    root('c', { extends: { sdlc: '../sdlc' }, uses: 'sdlc/decisions' })
    put('c/decisions/D-0001-split/README.md', '---\n---\n')
    put('c/decisions/D-0001-split/notes.md', 'Narrative.\n')
    assert.deepEqual([...(report().records.get('decisions')?.keys() ?? [])], ['D-0001'])
  })
})

describe('narrative in a type folder', () => {
  test('a folder whose name starts with _ holds narrative, at any depth', () => {
    principles()
    put('c/principles/_attachments/notes.md', 'Not a record.\n')
    put('c/principles/sub/_drafts/idea.md', 'Not a record.\n')
    put('c/principles/sub/P-0001.md', '---\n---\n')
    const r = report()
    assert.deepEqual(r.errors, [])
    assert.deepEqual([...(r.records.get('principles')?.keys() ?? [])], ['P-0001'])
  })
})

describe('schema and reference values', () => {
  test('a null x-ref value refers to nothing, and the schema says whether it is allowed', () => {
    root('c')
    put('c/tasks/tasks.schema.yaml', 'type: object\n')
    put(
      'c/notes/notes.schema.yaml',
      'type: object\nproperties:\n  parent: { type: [string, "null"], x-ref: tasks, x-ref-form: wikilink }\n  after: { type: array, items: { type: [string, "null"], x-ref: tasks, x-ref-form: id } }\n  strict: { type: string, x-ref: tasks }\n',
    )
    put('c/notes/N.md', '---\nparent: null\nafter: [null]\nstrict: null\n---\n')
    assert.deepEqual(errors(), ['notes/N.md: strict: must be string'])
  })

  test("a schema's links sit only in title, description and $comment", () => {
    root('c')
    put(
      'c/notes/notes.schema.yaml',
      'type: object\ndescription: "See [gone](gone.md)."\nproperties:\n  a: { type: string, pattern: "^\\\\[\\\\[.*\\\\]\\\\]$", enum: ["[[x]]"], $comment: "[[nowhere]]" }\n',
    )
    assert.deepEqual(errors().sort(), [
      'notes/notes.schema.yaml: description: gone.md: no such file',
      'notes/notes.schema.yaml: properties.a.$comment: [[nowhere]]: no file matches',
    ])
    assert.deepEqual(warnings(), [])
  })
})
