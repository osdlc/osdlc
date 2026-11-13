import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { beforeEach, describe, test } from 'vitest'

import { syncCorpus } from '../src/sync.ts'
import { has, scratch } from './corpora.ts'

const { at, put, root, org, report, errors } = scratch('extends')

describe('extends', () => {
  test('a relative path resolves from the corpus root, and the parent passes', () => {
    org()
    root('c', { extends: { org: '../org' } })
    put('c/rules/rules.schema.yaml', 'x-extends: org/principles\n')
    put('c/rules/Review.md', '---\nstatement: Review with care.\n---\n')
    const r = report()
    assert.deepEqual(r.errors, [])
    assert.deepEqual([...(r.records.get('rules')?.keys() ?? [])], ['Review'])
  })

  test('a package name resolves through node_modules, here or in a folder above', () => {
    put('node_modules/acme-org/package.json', '{"name":"acme-org","corpus":"data"}')
    org('node_modules/acme-org/data')
    root('work/c', { extends: { org: 'acme-org' } })
    put('work/c/rules/rules.schema.yaml', 'x-extends: org/principles\n')
    put('work/c/rules/Review.md', '---\nstatement: Review.\n---\n')
    assert.deepEqual(errors('work/c'), [])
  })

  test('a package with no corpus field is its own corpus root', () => {
    put('c/node_modules/@acme/org/package.json', '{"name":"@acme/org"}')
    org('c/node_modules/@acme/org')
    root('c', { extends: { org: '@acme/org' } })
    put('c/rules/rules.schema.yaml', 'x-extends: org/principles\n')
    assert.deepEqual(errors(), [])
  })

  test('each problem with a source is an error at its entry', () => {
    put('c/node_modules/bad-field/package.json', '{"corpus": 3}')
    put('c/node_modules/gone-folder/package.json', '{"corpus": "nope"}')
    put('c/node_modules/plain/package.json', '{}')
    put('c/plain/README.md', 'Notes.\n')
    root('c', {
      extends: {
        a: '@acme/missing',
        b: 'bad-field',
        d: 'gone-folder',
        e: 'plain',
        f: './plain',
        Bad_Prefix: './plain',
      },
      references: { g: './nowhere', h: 'Not A Name' },
    })
    const e = errors()
    for (const part of [
      'extends.a: package @acme/missing is not installed',
      'extends.b: package bad-field: its "corpus" field must be a folder path',
      'extends.d: package gone-folder: its "corpus" folder does not exist',
      'extends.e: plain: holds no corpus-schema root file',
      'extends.f: ./plain: holds no corpus-schema root file',
      'extends.Bad_Prefix: a prefix holds only lowercase letters, digits and -',
      'references.g: ./nowhere: no such folder',
      'references.h: Not A Name: not a package name',
    ])
      assert.ok(has(e, part), `${part}\n${e.join('\n')}`)
    assert.equal(e.length, 8)
  })

  test('extends must be a mapping of strings, and needs level 2', () => {
    put('c/c.corpus-schema.yaml', 'corpus-schema: 0\nlevel: 2\nextends: [a]\n')
    assert.ok(has(errors(), 'c.corpus-schema.yaml: extends: must map each prefix'))
    put('c/c.corpus-schema.yaml', 'corpus-schema: 0\nlevel: 2\nextends:\n  a: 3\n')
    assert.ok(has(errors(), 'extends.a: must be a package name or a ./ or ../ path'))
    org()
    root('c', { level: null, extends: { org: '../org' } })
    put('c/rules/rules.schema.yaml', 'type: object\nx-extends: org/principles\n')
    assert.deepEqual(errors(), ['c.corpus-schema.yaml: extends: needs level: 2 in the root file'])
  })

  test('a prefix sits in one key', () => {
    org()
    root('c', { extends: { org: '../org' }, references: { org: '../org' } })
    assert.deepEqual(errors(), [
      'c.corpus-schema.yaml: references.org: org is in extends too; a prefix sits in one key',
    ])
  })

  test('a cycle is an error, including a corpus that extends itself', () => {
    root('a', { extends: { b: '../b' } })
    root('b', { extends: { a: '../a' } })
    const e = errors('a')
    assert.equal(e.length, 1)
    assert.match(e[0] as string, /^a\.corpus-schema\.yaml: extends\.b: \.\.\/b has 1 error\(s\)/)
    assert.match(e[0] as string, /closes a cycle: a → b → a$/)
    root('c', { extends: { me: './' } })
    assert.deepEqual(errors(), ['c.corpus-schema.yaml: extends.me: ./ closes a cycle: c → c'])
  })

  test('a parent with errors of its own is an error, naming the first', () => {
    org()
    put('org/principles/Bad.md', '---\nstatement: 3\n---\n')
    root('c', { extends: { org: '../org' } })
    assert.deepEqual(errors(), [
      'c.corpus-schema.yaml: extends.org: ../org has 1 error(s); the first: principles/Bad.md: statement: must be string',
    ])
  })

  test('a corpus reached twice is loaded once, so its types are one type', () => {
    root('a')
    put('a/statements/statements.schema.yaml', 'type: object\n')
    root('b', { extends: { a: '../a' } })
    put('b/principles/principles.schema.yaml', 'x-extends: a/statements\n')
    put('b/principles/P.md', '---\n---\n')
    root('c', { extends: { a: '../a' }, references: { b: '../b' } })
    put(
      'c/notes/notes.schema.yaml',
      'type: object\nproperties:\n  cites: { type: string, x-ref: a/statements }\n',
    )
    put('c/notes/N.md', '---\ncites: "[P](../_references/b/principles/P.md)"\n---\n')
    assert.deepEqual(syncCorpus(at('c')).errors, [])
    assert.deepEqual(errors(), [])
  })
})

describe('extends gives types only', () => {
  test('a link into a parent is an error, and sync copies no parent', () => {
    org()
    root('c', { extends: { org: '../org' } })
    put('c/notes/notes.schema.yaml', 'type: object\n')
    put('c/notes/N.md', 'See [it](../_references/org/principles/Be%20Kind.md).\n')
    assert.deepEqual(syncCorpus(at('c')).written, [])
    assert.equal(existsSync(at('c/_references')), false)
    assert.deepEqual(errors(), [
      'notes/N.md: body: ../_references/org/principles/Be%20Kind.md: org is in extends, which gives types only; name the corpus in references to link to its files',
    ])
  })

  test("an x-ref to a parent's type finds no parent record by id", () => {
    org()
    root('c', { extends: { org: '../org' } })
    put('c/rules/rules.schema.yaml', 'x-extends: org/principles\n')
    put('c/rules/Local.md', '---\nstatement: s\n---\n')
    put(
      'c/notes/notes.schema.yaml',
      'type: object\nproperties:\n  see: { type: string, x-ref: org/principles, x-ref-form: id }\n',
    )
    put('c/notes/A.md', '---\nsee: Local\n---\n')
    put('c/notes/B.md', '---\nsee: Be Kind\n---\n')
    assert.deepEqual(errors(), [
      'notes/B.md: see: "Be Kind" is not the id of a record of type org/principles',
    ])
  })

  test("a local record may share an id with a parent's record", () => {
    org()
    root('c', { extends: { org: '../org' } })
    put('c/rules/rules.schema.yaml', 'x-extends: org/principles\n')
    put('c/rules/Be Kind.md', '---\nstatement: s\n---\n')
    assert.deepEqual(errors(), [])
  })
})

describe('x-extends', () => {
  beforeEach(() => {
    org()
    root('c', { extends: { org: '../org' } })
  })

  test('a record must pass every schema up the chain', () => {
    put(
      'c/rules/rules.schema.yaml',
      'x-extends: org/principles\nrequired: [team]\nproperties:\n  team: { type: string }\n',
    )
    put('c/team/team.schema.yaml', 'x-extends: rules\n')
    put('c/team/T.md', '---\nteam: a\n---\n')
    put('c/rules/R.md', '---\nstatement: s\n---\n')
    assert.deepEqual(errors().sort(), [
      'rules/R.md: team: required',
      'team/T.md: statement: required',
    ])
  })

  test('a parent type adds its x-id-pattern and its x-ref fields', () => {
    put(
      'org/principles/principles.schema.yaml',
      'type: object\nx-id-pattern: "^[A-Z]"\nproperties:\n  see: { type: string, x-ref: principles }\n',
    )
    put('c/rules/rules.schema.yaml', 'x-extends: org/principles\n')
    put('c/rules/lower.md', '---\n---\n')
    // A local rules record is an org/principles record.
    put('c/rules/Good.md', '---\nsee: "[Good](Good.md)"\n---\n')
    put('c/notes/notes.schema.yaml', 'type: object\n')
    put('c/notes/Other.md', '---\n---\n')
    put('c/rules/Bad.md', '---\nsee: "[Other](../notes/Other.md)"\n---\n')
    assert.deepEqual(errors().sort(), [
      'rules/Bad.md: see: notes/Other.md is not a record of type org/principles',
      'rules/lower.md: id: "lower" does not match x-id-pattern ^[A-Z]',
    ])
  })

  test('each bad x-extends is an error at the schema file', () => {
    put('c/a/a.schema.yaml', 'x-extends: b\n')
    put('c/b/b.schema.yaml', 'x-extends: a\n')
    put('c/d/d.schema.yaml', 'x-extends: missing\n')
    put('c/e/e.schema.yaml', 'x-extends: org/missing\n')
    put('c/f/f.schema.yaml', 'x-extends: nope/principles\n')
    put('c/g/g.schema.yaml', 'type: object\nproperties:\n  x: { x-extends: a }\n')
    put('c/h/h.schema.yaml', 'x-extends: [a]\n')
    const e = errors()
    for (const part of [
      'a/a.schema.yaml: x-extends: cycle: a → b → a',
      'b/b.schema.yaml: x-extends: cycle: b → a → b',
      'd/d.schema.yaml: x-extends: names unknown type "missing"',
      'e/e.schema.yaml: x-extends: names "org/missing", but org has no such type',
      'f/f.schema.yaml: x-extends: names unknown prefix "nope"',
      'g/g.schema.yaml: properties.x: x-extends sits only at the schema root',
      'h/h.schema.yaml: (schema)',
    ])
      assert.ok(has(e, part), `${part}\n${e.join('\n')}`)
  })

  test('a local type may extend a local type, without extends', () => {
    put('d/d.corpus-schema.yaml', 'corpus-schema: 0\n')
    put('d/base/base.schema.yaml', 'type: object\nrequired: [n]\n')
    put('d/sub/sub.schema.yaml', 'x-extends: base\n')
    put('d/sub/S.md', '---\n---\n')
    assert.deepEqual(errors('d'), ['sub/S.md: n: required'])
  })
})

describe('flattened x-extends', () => {
  beforeEach(() => {
    org()
    root('c', { extends: { org: '../org' } })
  })

  test('a closed child admits the fields of every type up its chain', () => {
    for (const closing of ['additionalProperties', 'unevaluatedProperties']) {
      put(
        'c/rules/rules.schema.yaml',
        `x-extends: org/principles\nproperties:\n  team: { type: string }\n`,
      )
      put(
        'c/team/team.schema.yaml',
        `x-extends: rules\n${closing}: false\nproperties:\n  lead: { type: string }\n`,
      )
      put('c/team/T.md', '---\nstatement: s\nteam: a\nlead: b\n---\n')
      assert.deepEqual(errors(), [], closing)
      put('c/team/T.md', '---\nstatement: s\nother: c\n---\n')
      assert.equal(errors().length, 1, closing)
      assert.match(errors()[0] ?? '', /^team\/T\.md: /)
    }
  })

  test("a closed child admits a parent's patternProperties", () => {
    put(
      'org/principles/principles.schema.yaml',
      'type: object\nproperties:\n  statement: { type: string }\npatternProperties:\n  "^x-": { type: string }\n',
    )
    put('c/rules/rules.schema.yaml', 'x-extends: org/principles\nadditionalProperties: false\n')
    put('c/rules/R.md', '---\nstatement: s\nx-note: n\n---\n')
    assert.deepEqual(errors(), [])
    put('c/rules/R.md', '---\nstatement: s\nx-note: 3\n---\n')
    assert.deepEqual(errors(), ['rules/R.md: x-note: must be string'])
  })

  test("a field declared again must still pass the parent's schema for it", () => {
    put(
      'org/principles/principles.schema.yaml',
      'type: object\nproperties:\n  statement: { type: string }\n  status: { enum: [draft, kept] }\n',
    )
    put(
      'c/rules/rules.schema.yaml',
      'x-extends: org/principles\nadditionalProperties: false\nproperties:\n  status: { type: string, enum: [kept, gone] }\n',
    )
    put('c/rules/Kept.md', '---\nstatement: s\nstatus: kept\n---\n')
    put('c/rules/Draft.md', '---\nstatement: s\nstatus: draft\n---\n')
    put('c/rules/Gone.md', '---\nstatement: s\nstatus: gone\n---\n')
    assert.deepEqual(errors().sort(), [
      'rules/Draft.md: status: must be equal to one of the allowed values',
      'rules/Gone.md: status: must be equal to one of the allowed values',
    ])
  })

  test('a closed parent admits no new field: the field is a schema error, and a record with it fails', () => {
    put(
      'org/principles/principles.schema.yaml',
      'type: object\nadditionalProperties: false\nproperties:\n  statement: { type: string }\n',
    )
    put(
      'c/rules/rules.schema.yaml',
      'x-extends: org/principles\nproperties:\n  statement: { minLength: 1 }\n  team: { type: string }\n',
    )
    put('c/rules/R.md', '---\nstatement: s\n---\n')
    put('c/rules/T.md', '---\nstatement: s\nteam: a\n---\n')
    assert.deepEqual(errors().sort(), [
      'rules/T.md: team: unknown field',
      'rules/rules.schema.yaml: properties.team: org/principles closes its fields, so no record can hold this one',
    ])
  })

  test('a parent closed with unevaluatedProperties gets no schema error for a field it evaluates elsewhere', () => {
    put(
      'org/principles/principles.schema.yaml',
      'type: object\nunevaluatedProperties: false\nproperties:\n  statement: { type: string }\nallOf:\n  - properties:\n      status: { enum: [draft, kept] }\n',
    )
    put(
      'c/rules/rules.schema.yaml',
      'x-extends: org/principles\nproperties:\n  status: { enum: [kept] }\n  team: { type: string }\n',
    )
    put('c/rules/Kept.md', '---\nstatement: s\nstatus: kept\n---\n')
    put('c/rules/Team.md', '---\nstatement: s\nteam: a\n---\n')
    // team is unevaluated in the parent, so the record fails there; the schema itself is not wrong.
    assert.deepEqual(errors(), ['rules/Team.md: (data): must NOT have unevaluated properties'])
  })

  test('a local chain flattens the same way', () => {
    put('c/base/base.schema.yaml', 'type: object\nproperties:\n  a: { type: string }\n')
    put('c/mid/mid.schema.yaml', 'x-extends: base\nproperties:\n  b: { type: string }\n')
    put('c/leaf/leaf.schema.yaml', 'x-extends: mid\nadditionalProperties: false\nrequired: [a]\n')
    put('c/leaf/L.md', '---\na: x\nb: y\n---\n')
    assert.deepEqual(errors(), [])
    put('c/leaf/L.md', '---\na: 1\nb: y\nc: z\n---\n')
    assert.deepEqual(errors().sort(), [
      'leaf/L.md: a: must be string',
      'leaf/L.md: c: unknown field',
    ])
  })
})
