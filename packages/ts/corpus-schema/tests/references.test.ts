import assert from 'node:assert/strict'
import { existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, test } from 'vitest'

import { syncCorpus } from '../src/sync.ts'
import { findCorpora, validateCorpus } from '../src/validate.ts'
import { has, scratch } from './corpora.ts'

const { at, put, read, root, org, report, errors } = scratch('references')
const sync = (rel = 'c') => syncCorpus(at(rel))
const KIND = 'principles/Be%20Kind.md'

describe('references', () => {
  test('a link into the copy resolves in the installed corpus, at any level', () => {
    org()
    for (const level of [null, 1, 2] as const) {
      root('c', { level, references: { org: '../org' } })
      put('c/notes/notes.schema.yaml', 'type: object\n')
      put(
        'c/notes/N.md',
        `See [it](../_references/org/${KIND}), [[../_references/org/principles/Be Kind]] and [[Be Kind]].\n`,
      )
      assert.deepEqual(sync().errors, [])
      const r = report()
      assert.deepEqual(r.errors, [], String(level))
      assert.deepEqual(r.warnings, [
        'notes/N.md: body: [[Be Kind]] is a bare name, not a path from this file; validate --fix rewrites it',
      ])
    }
  })

  test("a referenced corpus's types are x-ref targets, but not for x-extends or uses", () => {
    org()
    root('c', { references: { org: '../org' }, uses: 'org/principles' })
    put('c/rules/rules.schema.yaml', 'x-extends: org/principles\n')
    put(
      'c/notes/notes.schema.yaml',
      'type: object\nproperties:\n  see: { type: string, x-ref: org/principles }\n',
    )
    const why =
      'names "org", which is in references; references give no types to build on or use, so name the corpus in extends'
    assert.deepEqual(errors().sort(), [
      `c.corpus-schema.yaml: uses: "org/principles" ${why}`,
      `rules/rules.schema.yaml: x-extends: ${why}`,
    ])
  })

  test('a wikilink reaches records of direct references only; the id form reaches any depth', () => {
    org('g')
    root('p', { references: { g: '../g' } })
    root('c', { references: { p: '../p' } })
    put(
      'c/notes/notes.schema.yaml',
      'type: object\nproperties:\n  see: { type: string, x-ref: p/g/principles, x-ref-form: id }\n  about: { type: string, x-ref: p/g/principles, x-ref-form: wikilink }\n',
    )
    put('c/notes/N.md', '---\nsee: Be Kind\nabout: "[[Be Kind]]"\n---\n\nSee [[Be Kind]].\n')
    const far =
      'names p/g/principles/Be Kind.md, beyond a direct reference; a wikilink reaches only this corpus and the corpora it references directly, and the id form reaches any depth'
    assert.deepEqual(errors().sort(), [
      `notes/N.md: about: "Be Kind" ${far}`,
      `notes/N.md: body: [[Be Kind]]: ${far}`,
    ])
    // A wikilink path into a copy's own copy is out of reach too; a Markdown link is not.
    assert.deepEqual(sync('p').errors, [])
    assert.deepEqual(sync().errors, [])
    put(
      'c/notes/N.md',
      '---\nsee: Be Kind\n---\n\n[[../_references/p/_references/g/principles/Be Kind]] [it](../_references/p/_references/g/principles/Be%20Kind.md)\n',
    )
    assert.deepEqual(errors(), [
      "notes/N.md: body: [[../_references/p/_references/g/principles/Be Kind]]: reaches into p's own references; a wikilink reaches only this corpus and the corpora it references directly, and the id form reaches any depth",
    ])
  })

  test('nested references extend the path, for reading only', () => {
    org('g')
    root('p', { references: { g: '../g' } })
    root('c', { references: { p: '../p' } })
    put(
      'c/notes/notes.schema.yaml',
      'type: object\nproperties:\n  see: { type: string, x-ref: p/g/principles, x-ref-form: id }\n  bad: { type: string, x-ref: p/x/principles }\n',
    )
    put('c/notes/N.md', '---\nsee: Be Kind\n---\n')
    assert.deepEqual(errors(), [
      'notes/notes.schema.yaml: bad: x-ref names "p/x/principles", but p references no corpus as x',
    ])
    put('c/notes/notes.schema.yaml', 'x-extends: p/g/principles\n')
    assert.deepEqual(errors(), [
      'notes/notes.schema.yaml: x-extends: names "p/g/principles", a type through references; x-extends and uses take a type of a corpus in extends',
    ])
  })

  test('a cycle of references is an error', () => {
    root('a', { level: 1, references: { b: '../b' } })
    root('b', { level: 1, references: { a: '../a' } })
    assert.match(errors('a')[0] ?? '', /closes a cycle: a → b → a$/)
  })

  test('a prefix that neither key declares names no corpus', () => {
    root('c')
    put('c/notes/N.md', 'See [X](../_references/nope/X.md).\n')
    put('c/notes/notes.schema.yaml', 'type: object\n')
    assert.deepEqual(errors(), [
      'notes/N.md: body: ../_references/nope/X.md: _references/nope is not a reference; references declares no nope',
    ])
  })
})

describe('x-ref across corpora', () => {
  beforeEach(() => {
    org()
    // One corpus under two prefixes is one corpus, so base/principles is org/principles.
    root('c', { extends: { base: '../org' }, references: { org: '../org' } })
    put('c/rules/rules.schema.yaml', 'x-extends: base/principles\n')
    put('c/rules/Local.md', '---\nstatement: s\n---\n')
    put(
      'c/guides/guides.schema.yaml',
      'type: object\nproperties:\n  follows: { type: string, x-ref: org/principles }\n  rule: { type: string, x-ref: principles-local }\n',
    )
    put('c/principles-local/principles-local.schema.yaml', 'type: object\n')
    put('c/sub/sub.schema.yaml', 'x-extends: principles-local\n')
    put('c/sub/S.md', '---\n---\n')
  })

  test('accepts a referenced record and a local record whose type extends the type', () => {
    put(
      'c/guides/G.md',
      `---\nfollows: "[Be Kind](../_references/org/${KIND})"\nrule: "[S](../sub/S.md)"\n---\n`,
    )
    put('c/guides/H.md', '---\nfollows: "[Local](../rules/Local.md)"\n---\n')
    assert.deepEqual(sync().errors, [])
    assert.deepEqual(errors(), [])
  })

  test('a link into _references/ resolves in the installed corpus', () => {
    put('c/guides/G.md', '---\nfollows: "[Gone](../_references/org/principles/Gone.md)"\n---\n')
    put('c/guides/I.md', `---\nfollows: "[Org](../../org/${KIND})"\n---\n`)
    assert.deepEqual(sync().errors, [])
    const e = errors()
    assert.equal(e.length, 2, e.join('\n'))
    assert.ok(
      has(e, 'guides/G.md: follows: ../_references/org/principles/Gone.md: no such file in org'),
    )
    assert.ok(
      has(
        e,
        'guides/I.md: follows: must link to a record of type org/principles in this corpus or one it references',
      ),
    )
  })

  test('_references/ holds no local types, records or corpora', () => {
    assert.deepEqual(sync().errors, [])
    put('c/_references/notes.md', 'x')
    const r = report()
    assert.ok(!r.records.has('principles'))
    assert.deepEqual(findCorpora(at('c')), [at('c')])
  })
})

describe('identity', () => {
  /** Package `name` at `version`, installed in `rel`, holding tasks T-1. */
  const pkg = (rel: string, name: string, version: string): void => {
    put(`${rel}/package.json`, JSON.stringify({ name, version }))
    root(rel, { level: 1 })
    put(`${rel}/tasks/tasks.schema.yaml`, '')
    put(`${rel}/tasks/T-1.md`, '---\n---\n')
  }
  const notes = (ref: string): void => {
    put(
      'c/notes/notes.schema.yaml',
      `type: object\nproperties:\n  see: { type: string, x-ref: ${ref}, x-ref-form: id }\n`,
    )
    put('c/notes/N.md', '---\nsee: T-1\n---\n')
  }

  test('one record reached through two chains is one record, by the shortest chain', () => {
    pkg('c/node_modules/tasks', 'tasks', '1.0.0')
    root('c/node_modules/b', { level: 1, references: { t: 'tasks' } })
    put('c/node_modules/b/package.json', '{"name":"b","version":"1.0.0"}')
    root('c', { references: { b: 'b', t: 'tasks' } })
    notes('t/tasks')
    assert.deepEqual(errors(), [])
  })

  test('two copies of one package at one version give one type, for x-ref', () => {
    // A profile, installed at the top and again inside the corpus that c references.
    const profile = (rel: string): void => {
      put(`${rel}/package.json`, '{"name":"profile","version":"1.0.0"}')
      root(rel)
      put(`${rel}/principles/principles.schema.yaml`, 'type: object\n')
    }
    profile('c/node_modules/profile')
    profile('c/node_modules/starter/node_modules/profile')
    root('c/node_modules/starter', { extends: { p: 'profile' } })
    put('c/node_modules/starter/package.json', '{"name":"starter","version":"1.0.0"}')
    put('c/node_modules/starter/principles/principles.schema.yaml', 'x-extends: p/principles\n')
    put('c/node_modules/starter/principles/P-1.md', '---\n---\n')
    root('c', { extends: { p: 'profile' }, references: { st: 'starter' } })
    put(
      'c/notes/notes.schema.yaml',
      'type: object\nproperties:\n  cites: { type: string, x-ref: p/principles, x-ref-form: id }\n',
    )
    put('c/notes/N.md', '---\ncites: P-1\n---\n')
    assert.deepEqual(errors(), [])
  })

  test('one id in two corpora is two records, and an error', () => {
    pkg('c/node_modules/one', 'one', '1.0.0')
    pkg('c/node_modules/two', 'two', '1.0.0')
    root('c', { references: { one: 'one', two: 'two' } })
    notes('[one/tasks, two/tasks]')
    assert.deepEqual(errors(), [
      'notes/N.md: see: "T-1" matches more than one record: one/tasks/T-1.md, two/tasks/T-1.md',
    ])
  })

  test('a corpus at two versions is an error, naming both and their chains', () => {
    pkg('c/node_modules/tasks', 'tasks', '2.0.0')
    pkg('c/node_modules/b/node_modules/tasks', 'tasks', '1.0.0')
    root('c/node_modules/b', { level: 1, references: { t: 'tasks' } })
    put('c/node_modules/b/package.json', '{"name":"b","version":"1.0.0"}')
    root('c', { references: { b: 'b', t: 'tasks' } })
    assert.deepEqual(errors(), [
      "c.corpus-schema.yaml: (corpora): pkg:npm/tasks is at 2.0.0 as t and at 1.0.0 as b/t; a corpus's graph holds one version of each corpus",
    ])
  })

  test('extends counts toward one version too', () => {
    pkg('c/node_modules/tasks', 'tasks', '2.0.0')
    pkg('c/node_modules/b/node_modules/tasks', 'tasks', '1.0.0')
    root('c/node_modules/b', { extends: { t: 'tasks' } })
    put('c/node_modules/b/package.json', '{"name":"b","version":"1.0.0"}')
    root('c', { extends: { b: 'b', t: 'tasks' } })
    assert.ok(has(errors(), 'pkg:npm/tasks is at 2.0.0 as t and at 1.0.0 as b/t'))
  })
})

describe('the copy check', () => {
  beforeEach(() => {
    org()
    root('c', { references: { org: '../org' } })
    put('c/notes/notes.schema.yaml', 'type: object\n')
  })

  test('a corpus that never links into a referenced corpus needs no copy', () => {
    assert.deepEqual(errors(), [])
  })

  test('a link into a missing copy asks for sync, and validate writes nothing', () => {
    put('c/notes/N.md', `See [it](../_references/org/${KIND}).\n`)
    assert.deepEqual(errors(), [
      '_references/org: (copy): missing, and a file links into it; run corpus-schema sync',
    ])
    assert.equal(existsSync(at('c/_references')), false)
  })

  test('a copy that exists must match, even with no link into it', () => {
    assert.deepEqual(sync().errors, [])
    assert.deepEqual(errors(), [])
    put('org/principles/Be Kind.md', '---\nstatement: Changed.\n---\n')
    put('org/principles/New.md', '---\nstatement: New.\n---\n')
    put('c/_references/org/extra.md', 'x')
    put('c/_references/gone/x.md', 'x')
    assert.deepEqual(errors(), [
      '_references/gone: (copy): gone is not in references; run corpus-schema sync',
      '_references/org/principles/Be Kind.md: (copy): differs from the installed corpus; run corpus-schema sync',
      '_references/org/principles/New.md: (copy): missing; run corpus-schema sync',
      '_references/org/extra.md: (copy): not in the installed corpus; run corpus-schema sync',
    ])
  })

  test('reports at most ten files per corpus, then a count', () => {
    for (let i = 0; i < 12; i++) put(`org/notes-${i}.md`, `${i}\n`)
    put('c/_references/org/org.corpus-schema.yaml', read('org/org.corpus-schema.yaml'))
    const e = errors()
    assert.equal(e.length, 11)
    assert.equal(e[10], '_references/org: (copy): 4 more files differ; run corpus-schema sync')
  })

  test('a link two levels into _references/ needs the middle corpus to hold its copy', () => {
    root('g', { level: 1 })
    put('g/things/things.schema.yaml', '')
    put('g/things/X.md', '---\n---\n')
    root('p', { level: 1, references: { g: '../g' } })
    root('c', { references: { p: '../p' } })
    put('c/notes/N.md', 'See [X](../_references/p/_references/g/things/X.md).\n')
    assert.deepEqual(sync().errors, [])
    assert.deepEqual(errors(), [
      'notes/N.md: body: ../_references/p/_references/g/things/X.md: p holds no copy of it; run corpus-schema sync in p',
    ])
    assert.deepEqual(sync('p').errors, [])
    assert.deepEqual(sync().errors, [])
    assert.deepEqual(errors(), [])
  })

  test('an x-ref into a corpus that did not load adds no second error', () => {
    root('c', { references: { gone: '../gone' } })
    put(
      'c/notes/notes.schema.yaml',
      'type: object\nproperties:\n  see: { type: string, x-ref: gone/things }\n',
    )
    put('c/notes/N.md', '---\nsee: "[X](../_references/gone/things/X.md)"\n---\n')
    assert.deepEqual(errors(), ['c.corpus-schema.yaml: references.gone: ../gone: no such folder'])
  })
})

describe('syncCorpus', () => {
  test('writes each referenced corpus, with its own _references/, and a second run changes nothing', () => {
    root('a', { level: 1 })
    put('a/statements/statements.schema.yaml', '')
    root('b', { level: 1, references: { a: '../a' } })
    put('b/README.md', 'Narrative is copied too.\n')
    put('b/.hidden', 'left out')
    assert.deepEqual(sync('b').written, [
      '_references/a/a.corpus-schema.yaml',
      '_references/a/statements/statements.schema.yaml',
    ])
    root('c', { level: 1, references: { b: '../b' } })
    const first = sync()
    assert.deepEqual(first.errors, [])
    assert.deepEqual(first.written, [
      '_references/b/README.md',
      '_references/b/_references/a/a.corpus-schema.yaml',
      '_references/b/_references/a/statements/statements.schema.yaml',
      '_references/b/b.corpus-schema.yaml',
    ])
    assert.equal(read('c/_references/b/README.md'), 'Narrative is copied too.\n')
    const second = sync()
    assert.deepEqual([second.written, second.removed], [[], []])
    assert.deepEqual(errors(), [])
  })

  test('copies only references, not parents', () => {
    org()
    root('p', { level: 1 })
    root('c', { extends: { org: '../org' }, references: { p: '../p' } })
    assert.deepEqual(sync().written, ['_references/p/p.corpus-schema.yaml'])
  })

  test('removes stale files and empty folders, and _references/ once no reference is left', () => {
    org()
    root('c', { references: { org: '../org' } })
    sync()
    put('c/_references/old/x/y.md', 'stale')
    rmSync(at(`org/principles/Be Kind.md`))
    const r = sync()
    assert.deepEqual(r.removed, ['_references/old/x/y.md', '_references/org/principles/Be Kind.md'])
    assert.equal(existsSync(at('c/_references/old')), false)
    root('c')
    assert.equal(sync().removed.length, 2)
    assert.equal(existsSync(at('c/_references')), false)
  })

  test('writes nothing in a cycle, run after run', () => {
    root('a', { references: { b: '../b' } })
    root('b', { extends: { a: '../a' } })
    for (let run = 0; run < 2; run++) {
      for (const rel of ['a', 'b']) {
        const r = sync(rel)
        assert.deepEqual(r.written, [])
        assert.ok(has(r.errors, 'closes a cycle'), r.errors.join('\n'))
      }
      assert.equal(existsSync(at('a/_references')), false)
    }
  })

  test('writes nothing when a named corpus has errors of its own, or does not resolve', () => {
    org()
    put('org/principles/Bad.md', '---\nstatement: 3\n---\n')
    root('p', { level: 1 })
    root('c', { extends: { org: '../org' }, references: { p: '../p', gone: '../gone' } })
    const r = sync()
    assert.deepEqual(r.written, [])
    assert.deepEqual(r.errors, [
      'c.corpus-schema.yaml: extends.org: ../org has 1 error(s); the first: principles/Bad.md: statement: must be string',
      'c.corpus-schema.yaml: references.gone: ../gone: no such folder',
    ])
    assert.equal(existsSync(at('c/_references')), false)
  })

  test('replaces a folder the corpus turned into a file, and a file it turned into a folder', () => {
    org()
    put('org/guide/part.md', 'A part.\n')
    put('org/guide.md', 'A guide.\n')
    root('c', { references: { org: '../org' } })
    assert.deepEqual(sync().errors, [])
    put('c/_references/org/guide/.DS_Store', 'skipped by a corpus')
    // guide/ becomes a file, and guide.md a folder.
    rmSync(at('org/guide'), { recursive: true })
    put('org/guide', 'Now a file.\n')
    rmSync(at('org/guide.md'))
    put('org/guide.md/part.md', 'Now a folder.\n')
    const r = sync()
    assert.deepEqual(r.errors, [])
    assert.equal(read('c/_references/org/guide'), 'Now a file.\n')
    assert.equal(read('c/_references/org/guide.md/part.md'), 'Now a folder.\n')
    assert.deepEqual(errors(), [])
  })

  test('a relative corpus root resolves a package, for validate and sync', () => {
    put('c/node_modules/acme-org/package.json', '{"name":"acme-org"}')
    org('c/node_modules/acme-org')
    root('c', { references: { org: 'acme-org' } })
    put('c/notes/notes.schema.yaml', 'type: object\n')
    put('c/notes/N.md', `See [it](../_references/org/${KIND}).\n`)
    const cwd = process.cwd()
    process.chdir(at())
    try {
      assert.deepEqual(syncCorpus('c').errors, [])
      assert.deepEqual(validateCorpus('c').errors, [])
      process.chdir(at('c'))
      assert.deepEqual(validateCorpus('.').errors, [])
    } finally {
      process.chdir(cwd)
    }
  })

  test('a package with no package.json is its own corpus root; an unreadable one is an error', () => {
    org('c/node_modules/bare')
    mkdirSync(at('c/node_modules/odd/package.json'), { recursive: true })
    root('c', { references: { bare: 'bare', odd: 'odd' } })
    assert.deepEqual(errors(), [
      'c.corpus-schema.yaml: references.odd: package odd: cannot read its package.json (EISDIR)',
    ])
  })

  test('any root-file error stops sync', () => {
    org()
    root('c', { references: { org: '../org' }, extra: 'formats: [txt]\nid: 5\n' })
    const r = sync()
    assert.deepEqual(r.errors.sort(), [
      'c.corpus-schema.yaml: formats: must list one or more of md, yaml, json, once each',
      'c.corpus-schema.yaml: id: must be a non-empty string',
    ])
    assert.equal(existsSync(at('c/_references')), false)
  })

  test('sync does not write or remove through a symbolic link', () => {
    org()
    root('c', { references: { org: '../org' } })
    put('outside/empty/deeper/.keep', '')
    rmSync(at('outside/empty/deeper/.keep'))
    mkdirSync(at('c/_references'), { recursive: true })
    symlinkSync(at('outside'), at('c/_references/org'))
    symlinkSync(at('outside'), at('c/_references/old'))
    const r = sync()
    assert.deepEqual(r.errors, [
      '_references/org: (symlink): sync does not write through a symbolic link; remove it',
    ])
    assert.deepEqual(r.written, [])
    assert.equal(existsSync(at('outside/outside.corpus-schema.yaml')), false)
    assert.equal(existsSync(at('outside/empty/deeper')), true)

    rmSync(at('c/_references'), { recursive: true })
    symlinkSync(at('outside'), at('c/_references'))
    assert.deepEqual(sync().errors, [
      '_references: (symlink): sync does not write through a symbolic link; remove it',
    ])
    assert.equal(existsSync(join(at('outside'), 'empty/deeper')), true)
  })
})
