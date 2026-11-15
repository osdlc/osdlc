import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'vitest'

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'

import { syncCorpus } from '../src/sync.ts'
import { validateCorpus } from '../src/validate.ts'

let dir = ''
const put = (rel: string, text: string): void => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), text)
}
const read = (rel: string): string => readFileSync(join(dir, rel), 'utf8')
const root = (rel: string, extra = ''): void =>
  put(
    `${rel}/${basename(rel)}.corpus-schema.yaml`,
    `corpus-schema: 0\nlevel: 2\nformats: [md, yaml]\n${extra}`,
  )
const report = (rel = 'c', fix = false): ReturnType<typeof validateCorpus> =>
  validateCorpus(join(dir, rel), { fix })
const errors = (rel = 'c'): string[] => report(rel).errors

/** A corpus `c` with tasks T-0001 and T-0002, decisions D-0001, and notes with a ref field. */
const plan = (ref: string): void => {
  root('c')
  put('c/tasks/tasks.schema.yaml', 'type: object\n')
  put('c/tasks/T-0001.md', '---\n---\n')
  put('c/tasks/done/T-0002.yaml', '{}\n')
  put('c/decisions/decisions.schema.yaml', 'type: object\n')
  put('c/decisions/D-0001.md', '---\n---\n')
  put('c/notes/notes.schema.yaml', `type: object\nproperties:\n  about: ${ref}\n`)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'corpus-schema-refs-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('x-ref-form: id', () => {
  const items = '{ type: array, items: { type: string, x-ref: tasks, x-ref-form: id } }'

  test('a bare id resolves to a record of the type, in any folder and format', () => {
    plan(items)
    put('c/notes/N.md', '---\nabout: [T-0001, T-0002]\n---\n')
    assert.deepEqual(errors(), [])
  })

  test('ids match after NFC normalization and case folding', () => {
    plan(items)
    put('c/tasks/Café.md', '---\n---\n')
    put('c/notes/N.md', `---\nabout: [t-0001, "${'CAFÉ'}"]\n---\n`)
    assert.deepEqual(errors(), [])
  })

  test('an id of no record of the type, or a value that is not a string, is an error', () => {
    // The items' schema allows any value, so the x-ref check sees the number.
    plan('{ type: array, items: { x-ref: tasks, x-ref-form: id } }')
    put('c/notes/N.md', '---\nabout: [T-0009, D-0001, 12]\n---\n')
    assert.deepEqual(errors().sort(), [
      'notes/N.md: about: "D-0001" is not the id of a record of type tasks',
      'notes/N.md: about: "T-0009" is not the id of a record of type tasks',
      'notes/N.md: about: must be the id of a record, such as "T-0012"',
    ])
  })

  test('a link is not an id, and an id field gets no link checks', () => {
    plan('{ type: string, x-ref: tasks, x-ref-form: id }')
    put('c/notes/N.md', '---\nabout: "[T](../tasks/T-0001.md)"\n---\n')
    assert.deepEqual(errors(), [
      'notes/N.md: about: "[T](../tasks/T-0001.md)" is not the id of a record of type tasks',
    ])
  })

  test('an id resolves to a referenced record, and to local records of types that extend the type', () => {
    root('org')
    put('org/tasks/tasks.schema.yaml', 'type: object\n')
    put('org/tasks/T-0100.md', '---\n---\n')
    // One corpus under two prefixes is one corpus: base/tasks and org/tasks are one type.
    root('c', 'extends:\n  base: ../org\nreferences:\n  org: ../org\n')
    put('c/tasks/tasks.schema.yaml', 'x-extends: base/tasks\n')
    put('c/tasks/T-0001.md', '---\n---\n')
    put(
      'c/notes/notes.schema.yaml',
      'type: object\nproperties:\n  about: { type: array, items: { type: string, x-ref: org/tasks, x-ref-form: id } }\n',
    )
    put('c/notes/N.md', '---\nabout: [T-0100, T-0001]\n---\n')
    // An id is not a link, so the corpus needs no copy of org.
    assert.deepEqual(errors(), [])
  })

  test('an id that matches records of two types is an error', () => {
    plan('{ type: string, x-ref: [tasks, decisions], x-ref-form: id }')
    put('c/decisions/T-0001.md', '---\n---\n')
    put('c/notes/N.md', '---\nabout: T-0001\n---\n')
    assert.deepEqual(errors(), [
      'notes/N.md: about: "T-0001" matches more than one record: decisions/T-0001.md, tasks/T-0001.md',
    ])
  })
})

describe('x-ref-form: wikilink', () => {
  const items = '{ type: array, items: { type: string, x-ref: tasks, x-ref-form: wikilink } }'

  test('[[id]] and [[id|text]] resolve by id, with no wikilink warning', () => {
    plan(items)
    put('c/notes/N.md', '---\nabout: ["[[T-0001]]", "[[t-0002|the second]]"]\n---\n')
    const r = report()
    assert.deepEqual(r.errors, [])
    assert.deepEqual(r.warnings, [])
  })

  test('a path, a heading, a bare id or an unquoted wikilink is an error', () => {
    plan('{ type: array, items: { x-ref: tasks, x-ref-form: wikilink } }')
    put(
      'c/notes/N.md',
      '---\nabout: ["[[tasks/T-0001]]", "[[T-0001#Plan]]", T-0001, [[T-0002]]]\n---\n',
    )
    const wanted = 'notes/N.md: about: must be a wikilink to a record id'
    const e = errors()
    assert.equal(e.length, 4)
    assert.ok(e.every((l) => l.startsWith(wanted)))
  })

  test('validate --fix leaves a wikilink field as it is, and rewrites the others', () => {
    plan(items)
    put(
      'c/notes/notes.schema.yaml',
      `type: object\nproperties:\n  about: ${items}\n  see: { type: string }\n`,
    )
    const text = '---\nabout: ["[[T-0001]]"]\nsee: "[[T-0001]]"\n---\n\nSee [[T-0002]].\n'
    put('c/notes/N.md', text)
    const r = report('c', true)
    assert.deepEqual(r.fixed, ['notes/N.md'])
    assert.equal(
      read('c/notes/N.md'),
      '---\nabout: ["[[T-0001]]"]\nsee: "[T-0001](../tasks/T-0001.md)"\n---\n\nSee [T-0002](../tasks/done/T-0002.yaml).\n',
    )
    assert.deepEqual(r.errors, [])
  })

  test('a wikilink to a referenced record needs the copy, which sync writes', () => {
    root('org')
    put('org/tasks/tasks.schema.yaml', 'type: object\n')
    put('org/tasks/T-0100.md', '---\n---\n')
    root('c', 'references:\n  org: ../org\n')
    put(
      'c/notes/notes.schema.yaml',
      'type: object\nproperties:\n  about: { type: string, x-ref: org/tasks, x-ref-form: wikilink }\n',
    )
    put('c/notes/N.md', '---\nabout: "[[T-0100]]"\n---\n')
    assert.deepEqual(errors(), [
      '_references/org: (copy): missing, and a file links into it; run corpus-schema sync',
    ])
    assert.deepEqual(syncCorpus(join(dir, 'c')).errors, [])
    assert.deepEqual(errors(), [])
  })
})

describe('x-ref to several types', () => {
  test('accepts a record of any listed type, and of a type that extends one', () => {
    plan('{ type: array, items: { type: string, x-ref: [tasks, decisions] } }')
    put('c/specs/specs.schema.yaml', 'x-extends: decisions\n')
    put('c/specs/S-1.md', '---\n---\n')
    put(
      'c/notes/N.md',
      '---\nabout:\n  - "[T](../tasks/T-0001.md)"\n  - "[D](../decisions/D-0001.md)"\n  - "[S](../specs/S-1.md)"\n---\n',
    )
    assert.deepEqual(errors(), [])
  })

  test('a record of a type not listed is an error naming every listed type', () => {
    plan('{ type: string, x-ref: [tasks, decisions] }')
    put('c/milestones/milestones.schema.yaml', 'type: object\n')
    put('c/milestones/M-1.md', '---\n---\n')
    put('c/notes/N.md', '---\nabout: "[M](../milestones/M-1.md)"\n---\n')
    assert.deepEqual(errors(), [
      'notes/N.md: about: milestones/M-1.md is not a record of type tasks or decisions',
    ])
  })

  test('an empty list, a non-string name and an unknown name are schema errors', () => {
    plan('{ type: string, x-ref: [] }')
    put(
      'c/other/other.schema.yaml',
      'type: object\nproperties:\n  a: { x-ref: [tasks, 3] }\n  b: { x-ref: [tasks, gone] }\n',
    )
    put('c/notes/N.md', '---\nabout: anything\n---\n')
    put('c/other/O.md', '---\nb: anything\n---\n')
    // A field whose x-ref names no type is not checked further.
    assert.deepEqual(errors().sort(), [
      'notes/notes.schema.yaml: about: x-ref must name a type or list one or more types',
      'other/other.schema.yaml: a: x-ref must name a type or list one or more types',
      'other/other.schema.yaml: b: x-ref names unknown type "gone"',
    ])
  })
})

describe('x-ref-form placement', () => {
  test('x-ref-form needs a known form and an x-ref beside it', () => {
    plan('{ type: string, x-ref: tasks, x-ref-form: path }')
    put(
      'c/other/other.schema.yaml',
      'type: object\nproperties:\n  a: { type: string, x-ref-form: id }\n',
    )
    assert.deepEqual(errors().sort(), [
      'notes/notes.schema.yaml: about: x-ref-form must be link, id or wikilink',
      'other/other.schema.yaml: properties.a: x-ref-form sits only beside x-ref',
    ])
  })

  test('x-ref-form: link is the default form', () => {
    plan('{ type: string, x-ref: tasks, x-ref-form: link }')
    put('c/notes/N.md', '---\nabout: "[T](../tasks/T-0001.md)"\n---\n')
    assert.deepEqual(errors(), [])
    put('c/notes/N.md', '---\nabout: T-0001\n---\n')
    assert.deepEqual(errors(), ['notes/N.md: about: must be one link, such as "[Name](Name.md)"'])
  })
})
