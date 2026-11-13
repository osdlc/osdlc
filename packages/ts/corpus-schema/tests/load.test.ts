/** loadCorpus: a corpus as plain data, with its types, records and resolved references. */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { getCorpus, getRecord, getType, loadCorpus, recordsOf, resolveTarget } from '../src/load.ts'
import { syncCorpus } from '../src/sync.ts'
import { validateCorpus } from '../src/validate.ts'
import { FAMILY_DIR } from './conformance.ts'
import { has, scratch } from './corpora.ts'

const s = scratch('load')

/**
 * Three corpora. `profile` holds the type `principles`. `org` uses it and holds one record.
 * `c` extends `profile`, references `org`, and holds a type of each kind and records of each
 * format.
 */
function corpora(): void {
  s.root('profile')
  s.put(
    'profile/principles/principles.schema.yaml',
    'title: Principle\ndescription: A rule of conduct.\ntype: object\nrequired: [statement]\nproperties:\n  statement: { type: string }\n',
  )
  s.root('org', { extends: { p: '../profile' }, uses: 'p/principles' })
  s.put('org/principles/Be Kind.md', '---\nstatement: Care.\n---\n')

  s.root('c', {
    extra: 'id: team-db\nformats: [md, yaml, json]\n',
    extends: { p: '../profile' },
    references: { org: '../org' },
    uses: ['p/principles'],
  })
  s.put('c/principles/Be Brief.md', '---\nstatement: Say less.\n---\n')
  s.put('c/people/people.schema.yaml', 'type: object\nproperties:\n  title: { type: string }\n')
  s.put('c/people/Ada.yaml', 'title: Ada Lovelace\n')
  s.put('c/people/Bob.json', '{}')
  s.put('c/methods/methods.schema.yaml', 'type: object\n')
  s.put('c/methods/Survey/Survey.md', 'See [the counts](results/counts.csv).\n')
  s.put('c/methods/Survey/count.py', '')
  s.put('c/methods/Survey/results/counts.csv', '')
  s.put(
    'c/rules/rules.schema.yaml',
    [
      'x-extends: p/principles',
      'required: [owner]',
      'properties:',
      '  owner: { type: string, x-ref: people }',
      '  follows: { x-ref: org/principles, x-ref-form: id }',
      '  method: { x-ref: methods, x-ref-form: wikilink }',
      '  reviewers: { type: array, items: { x-ref: people, x-ref-form: id } }',
      '',
    ].join('\n'),
  )
  s.put(
    'c/rules/Review Kindly.md',
    [
      '---',
      'statement: Review with care.',
      'owner: "[Ada](../people/Ada.yaml)"',
      'follows: Be Kind',
      'method: "[[Survey]]"',
      'reviewers: [Bob, Ada, Zed]',
      '---',
      'Ask [Bob](../people/Bob.json), see [[Be Brief]] and [the README](../README.md).',
      'Follows [Be Kind](../_references/org/principles/Be%20Kind.md).',
      '',
    ].join('\n'),
  )
  s.put('c/README.md', 'Narrative.\n')
}

describe('the corpus', () => {
  test('its name, root, level, id, root file and the corpora it names', () => {
    corpora()
    const c = loadCorpus(s.at('c'))
    expect([c.key, c.name, c.root, c.rootFile, c.id, c.level]).toEqual([
      '',
      'c',
      s.at('c'),
      'c.corpus-schema.yaml',
      'team-db',
      2,
    ])
    expect([c.identity, c.version]).toEqual([null, null])
    expect(c.extends).toEqual({ p: 'p' })
    expect(c.references).toEqual({ org: 'org' })
    expect(Object.keys(c.corpora)).toEqual(['org', 'p'])
    expect(getCorpus(c)).toBe(c)
    expect(getCorpus(c, 'org')?.name).toBe('org')
    expect(getCorpus(c, 'nope')).toBeUndefined()
  })

  test('a corpus reached by two chains is loaded once, under the shortest', () => {
    corpora()
    const c = loadCorpus(s.at('c'))
    // org extends profile too: the same corpus as c's own p.
    expect(c.corpora['org']?.extends).toEqual({ p: 'p' })
    expect(Object.keys(c.corpora)).not.toContain('org/p')
  })

  test('a packaged corpus, its types and its records have identities', () => {
    s.put('pkg/package.json', '{"name":"@acme/org","version":"1.2.0","corpus":"corpus"}')
    s.org('pkg/corpus')
    const c = loadCorpus(s.at('pkg/corpus'))
    expect([c.identity, c.version]).toEqual(['pkg:npm/%40acme/org', '1.2.0'])
    expect(getType(c, 'principles')?.identity).toBe('pkg:npm/%40acme/org#principles')
    expect(getRecord(c, 'principles', 'Be Kind')?.identity).toBe(
      'pkg:npm/%40acme/org#principles/Be%20Kind',
    )
  })

  test('its errors and warnings are the ones validateCorpus reports', () => {
    corpora()
    const c = loadCorpus(s.at('c'))
    const report = validateCorpus(s.at('c'))
    expect(c.errors).toEqual(report.errors)
    expect(c.warnings).toEqual(report.warnings)
    expect(has(c.errors, 'reviewers: "Zed" is not the id of a record')).toBe(true)
  })
})

describe('types', () => {
  test('a local type, one that extends a parent type, and one uses gives', () => {
    corpora()
    const c = loadCorpus(s.at('c'))
    expect(c.types.map((t) => [t.name, t.origin, t.dir, t.schemaFile])).toEqual([
      ['methods', 'local', 'methods', 'methods/methods.schema.yaml'],
      ['people', 'local', 'people', 'people/people.schema.yaml'],
      ['principles', 'uses', 'principles', null],
      ['rules', 'extends', 'rules', 'rules/rules.schema.yaml'],
    ])
    const principle = { corpus: 'p', type: 'principles', name: 'p/principles' }
    expect(getType(c, 'rules')?.chain).toEqual([
      { corpus: '', type: 'rules', name: 'rules' },
      principle,
    ])
    expect(getType(c, 'principles')?.chain).toEqual([
      { corpus: '', type: 'principles', name: 'principles' },
      principle,
    ])
    expect(getType(c, 'principles', 'p')?.origin).toBe('local')
  })

  test('title and description come from the nearest schema that has them', () => {
    corpora()
    const c = loadCorpus(s.at('c'))
    for (const name of ['rules', 'principles'])
      expect([getType(c, name)?.title, getType(c, name)?.description]).toEqual([
        'Principle',
        'A rule of conduct.',
      ])
    expect(getType(c, 'people')?.title).toBeNull()
  })

  test('the own schema is as written, and the flattened one adds the inherited fields as true', () => {
    corpora()
    const c = loadCorpus(s.at('c'))
    const rules = getType(c, 'rules')
    expect(Object.keys(rules?.schema?.['properties'] as object)).toEqual([
      'owner',
      'follows',
      'method',
      'reviewers',
    ])
    expect(rules?.flattened?.['properties']).toMatchObject({ statement: true })
    const used = getType(c, 'principles')
    expect(used?.schema).toBeNull()
    expect(used?.flattened).toEqual(getType(c, 'principles', 'p')?.schema)
  })

  test('fields list the whole chain, the parent first, with required and x-ref', () => {
    corpora()
    const fields = getType(loadCorpus(s.at('c')), 'rules')?.fields ?? []
    expect(fields.map((f) => [f.name, f.declaredBy.name, f.required])).toEqual([
      ['statement', 'p/principles', true],
      ['owner', 'rules', true],
      ['follows', 'rules', false],
      ['method', 'rules', false],
      ['reviewers', 'rules', false],
    ])
    expect(fields[0]).toMatchObject({ schema: { type: 'string' }, ref: null })
    expect(fields.slice(1).map((f) => f.ref)).toEqual([
      {
        types: ['people'],
        targets: [{ corpus: '', type: 'people', name: 'people' }],
        form: 'link',
        items: false,
      },
      {
        types: ['org/principles'],
        targets: [{ corpus: 'org', type: 'principles', name: 'org/principles' }],
        form: 'id',
        items: false,
      },
      {
        types: ['methods'],
        targets: [{ corpus: '', type: 'methods', name: 'methods' }],
        form: 'wikilink',
        items: false,
      },
      {
        types: ['people'],
        targets: [{ corpus: '', type: 'people', name: 'people' }],
        form: 'id',
        items: true,
      },
    ])
  })

  test('an x-ref that names no type has null targets, and its values are unresolved', () => {
    s.root('c')
    s.put('c/notes/notes.schema.yaml', 'properties:\n  about: { x-ref: nope, x-ref-form: id }\n')
    s.put('c/notes/A.md', '---\nabout: B\n---\n')
    const c = loadCorpus(s.at('c'))
    expect(getType(c, 'notes')?.fields[0]?.ref?.targets).toBeNull()
    expect(getRecord(c, 'notes', 'A')?.references).toEqual([
      {
        field: 'about',
        pointer: '/about',
        value: 'B',
        form: 'id',
        target: null,
        unresolved: 'its x-ref names a type that does not resolve',
      },
    ])
  })

  test('x-record-file is the one in force up the chain', () => {
    s.root('c')
    s.put('c/decisions/decisions.schema.yaml', 'x-record-file: README.md\n')
    s.put('c/adrs/adrs.schema.yaml', 'x-extends: decisions\n')
    s.put('c/adrs/D-1/README.md', '')
    s.put('c/adrs/D-1/notes.txt', '')
    const c = loadCorpus(s.at('c'))
    expect(getType(c, 'adrs')?.recordFile).toBe('README.md')
    expect(getRecord(c, 'adrs', 'D-1')).toMatchObject({
      path: 'adrs/D-1/README.md',
      name: 'D-1',
      folder: 'adrs/D-1',
      files: ['adrs/D-1/notes.txt'],
    })
  })
})

describe('records', () => {
  test('each format, with its data, body, name and title', () => {
    corpora()
    const c = loadCorpus(s.at('c'))
    expect(
      recordsOf(c, 'people').map((r) => [r.id, r.path, r.format, r.title, r.data, r.body]),
    ).toEqual([
      ['Ada', 'people/Ada.yaml', 'yaml', 'Ada Lovelace', { title: 'Ada Lovelace' }, null],
      ['Bob', 'people/Bob.json', 'json', 'Bob', {}, null],
    ])
    const rule = getRecord(c, 'rules', 'review kindly')
    expect(rule).toMatchObject({
      id: 'Review Kindly',
      type: 'rules',
      path: 'rules/Review Kindly.md',
      name: 'Review Kindly',
      format: 'md',
      valid: true,
      identity: null,
      folder: null,
      files: [],
    })
    expect(rule?.data['statement']).toBe('Review with care.')
    expect(rule?.body).toMatch(/^Ask \[Bob\]/)
    expect(recordsOf(c, 'nope')).toEqual([])
    expect(getRecord(c, 'people', 'Zed')).toBeUndefined()
  })

  test('a record folder lists its other files', () => {
    corpora()
    expect(getRecord(loadCorpus(s.at('c')), 'methods', 'Survey')).toMatchObject({
      path: 'methods/Survey/Survey.md',
      folder: 'methods/Survey',
      files: ['methods/Survey/count.py', 'methods/Survey/results/counts.csv'],
    })
  })

  test('the id is cut by x-id-pattern, and the name is the file stem', () => {
    s.root('c')
    s.put('c/tasks/tasks.schema.yaml', 'x-id-pattern: "^T-[0-9]+$"\n')
    s.put('c/tasks/T-12-write-it.md', '')
    expect(loadCorpus(s.at('c')).records.map((r) => [r.id, r.name, r.title])).toEqual([
      ['T-12', 'T-12-write-it', 'T-12-write-it'],
    ])
  })

  test('bodies: false leaves every body null', () => {
    corpora()
    expect(loadCorpus(s.at('c'), { bodies: false }).records.every((r) => r.body === null)).toBe(
      true,
    )
  })
})

describe('references', () => {
  test('by link, id and wikilink, in a list, and into a referenced corpus', () => {
    corpora()
    const c = loadCorpus(s.at('c'))
    const ada = { corpus: '', type: 'people', id: 'Ada', path: 'people/Ada.yaml' }
    expect(getRecord(c, 'rules', 'Review Kindly')?.references).toEqual([
      {
        field: 'follows',
        pointer: '/follows',
        value: 'Be Kind',
        form: 'id',
        target: { corpus: 'org', type: 'principles', id: 'Be Kind', path: 'principles/Be Kind.md' },
        unresolved: null,
      },
      {
        field: 'method',
        pointer: '/method',
        value: '[[Survey]]',
        form: 'wikilink',
        target: { corpus: '', type: 'methods', id: 'Survey', path: 'methods/Survey/Survey.md' },
        unresolved: null,
      },
      {
        field: 'owner',
        pointer: '/owner',
        value: '[Ada](../people/Ada.yaml)',
        form: 'link',
        target: ada,
        unresolved: null,
      },
      {
        field: 'reviewers',
        pointer: '/reviewers/0',
        value: 'Bob',
        form: 'id',
        target: { corpus: '', type: 'people', id: 'Bob', path: 'people/Bob.json' },
        unresolved: null,
      },
      { field: 'reviewers', pointer: '/reviewers/1', value: 'Ada', form: 'id', target: ada, unresolved: null }, // prettier-ignore
      {
        field: 'reviewers',
        pointer: '/reviewers/2',
        value: 'Zed',
        form: 'id',
        target: null,
        unresolved: '"Zed" is not the id of a record of type people',
      },
    ])
  })

  test('a target resolves to the record, in any corpus of the graph', () => {
    corpora()
    const c = loadCorpus(s.at('c'))
    const follows = getRecord(c, 'rules', 'Review Kindly')?.references[0]?.target
    expect(resolveTarget(c, follows!)).toBe(c.corpora['org']?.records[0])
    expect(resolveTarget(c, { corpus: 'org', type: 'principles', id: 'x', path: 'x.md' })).toBe(
      undefined,
    )
  })

  test('a broken link in a link field is unresolved, with the link check as the reason', () => {
    s.root('c')
    s.put('c/notes/notes.schema.yaml', 'properties:\n  about: { x-ref: notes }\n')
    s.put('c/notes/A.md', '---\nabout: "[B](B.md)"\n---\n')
    s.put('c/notes/C.md', '---\nabout: null\n---\n')
    const c = loadCorpus(s.at('c'))
    expect(c.errors).toEqual(['notes/A.md: about: B.md: no such file'])
    expect(getRecord(c, 'notes', 'A')?.references[0]).toMatchObject({
      target: null,
      unresolved: 'B.md: no such file',
    })
    expect(getRecord(c, 'notes', 'C')?.references).toEqual([])
  })

  test('a field name is escaped in its JSON Pointer', () => {
    s.root('c')
    s.put('c/notes/notes.schema.yaml', 'properties:\n  "a/b~c": { x-ref: notes, x-ref-form: id }\n')
    s.put('c/notes/A.md', '---\n"a/b~c": A\n---\n')
    expect(loadCorpus(s.at('c')).records[0]?.references[0]?.pointer).toBe('/a~1b~0c')
  })

  test('references resolve without the _references copy, and with it', () => {
    corpora()
    const before = loadCorpus(s.at('c'))
    expect(has(before.errors, '_references/org: (copy): missing')).toBe(true)
    expect(syncCorpus(s.at('c')).errors).toEqual([])
    const after = loadCorpus(s.at('c'))
    expect(has(after.errors, '(copy)')).toBe(false)
    expect(after.records).toEqual(before.records)
    // The copy's files are not records of the corpus.
    expect(after.records.some((r) => r.path.startsWith('_references/'))).toBe(false)
  })
})

describe('body links and backlinks', () => {
  test('each body link to a record, in order, with its place in the body', () => {
    corpora()
    const rule = getRecord(loadCorpus(s.at('c')), 'rules', 'Review Kindly')
    const links = rule?.links ?? []
    expect(links.map((l) => [l.kind, l.text, l.href, l.target.corpus, l.target.path])).toEqual([
      ['markdown', 'Bob', '../people/Bob.json', '', 'people/Bob.json'],
      ['wiki', '', 'Be Brief', '', 'principles/Be Brief.md'],
      ['markdown', 'Be Kind', '../_references/org/principles/Be%20Kind.md', 'org', 'principles/Be Kind.md'], // prettier-ignore
    ])
    expect(links.map((l) => rule?.body?.slice(l.start, l.end))).toEqual([
      '[Bob](../people/Bob.json)',
      '[[Be Brief]]',
      '[Be Kind](../_references/org/principles/Be%20Kind.md)',
    ])
  })

  test('incoming lists each reference and body link that points at the record', () => {
    corpora()
    const c = loadCorpus(s.at('c'))
    const from = { corpus: '', type: 'rules', id: 'Review Kindly', path: 'rules/Review Kindly.md' }
    expect(getRecord(c, 'people', 'Ada')?.incoming).toEqual([
      { from, via: 'reference', pointer: '/owner' },
      { from, via: 'reference', pointer: '/reviewers/1' },
    ])
    expect(getRecord(c, 'people', 'Bob')?.incoming).toEqual([
      { from, via: 'reference', pointer: '/reviewers/0' },
      { from, via: 'link', pointer: null },
    ])
    expect(getRecord(c, 'principles', 'Be Kind', 'org')?.incoming).toEqual([
      { from, via: 'reference', pointer: '/follows' },
      { from, via: 'link', pointer: null },
    ])
    expect(getRecord(c, 'rules', 'Review Kindly')?.incoming).toEqual([])
  })
})

describe('order and JSON', () => {
  test('types sort by name, records by type, id and path', () => {
    s.root('c')
    for (const type of ['b', 'a', 'C']) s.put(`c/${type}/${type}.schema.yaml`, '')
    for (const file of ['b/z.md', 'b/sub/Y.md', 'a/2.md', 'a/10.md', 'C/x.md'])
      s.put(`c/${file}`, '')
    const c = loadCorpus(s.at('c'))
    expect(c.types.map((t) => t.name)).toEqual(['C', 'a', 'b'])
    expect(c.records.map((r) => r.path)).toEqual([
      'C/x.md',
      'a/10.md',
      'a/2.md',
      'b/sub/Y.md',
      'b/z.md',
    ])
  })

  test('the model survives JSON, and the lookups work on the copy', () => {
    corpora()
    const c = loadCorpus(s.at('c'))
    const text = JSON.stringify(c)
    const copy = JSON.parse(text) as typeof c
    expect(copy).toEqual(c)
    expect(JSON.stringify(loadCorpus(s.at('c')))).toBe(text)
    expect(text).not.toContain('undefined')
    const follows = getRecord(copy, 'rules', 'Review Kindly')?.references[0]?.target
    expect(resolveTarget(copy, follows!)?.id).toBe('Be Kind')
  })

  test('every conformance corpus loads, with the validator’s lines, the same twice and through JSON', () => {
    const dir = join(FAMILY_DIR, 'corpora')
    const roots = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory())
    expect(roots.length).toBeGreaterThan(50)
    for (const { name } of roots) {
      const report = validateCorpus(join(dir, name))
      const c = loadCorpus(join(dir, name))
      expect([name, c.errors, c.warnings]).toEqual([name, report.errors, report.warnings])
      const text = JSON.stringify(c)
      expect(JSON.parse(text), name).toEqual(c)
      expect(JSON.stringify(loadCorpus(join(dir, name))), name).toBe(text)
      const valid = c.records.filter((r) => r.valid).map((r) => `${r.type}/${r.id}`)
      const want = [...report.records].flatMap(([type, ids]) =>
        [...ids.keys()].map((id) => `${type}/${id}`),
      )
      expect(valid.sort(), name).toEqual(want.sort())
      if (report.errors.length === 0)
        expect(
          c.records.every((r) => r.valid && r.references.every((f) => f.target !== null)),
          name,
        ).toBe(true)
    }
  })
})

describe('a corpus with errors', () => {
  test('a folder with no root file loads empty, with the error', () => {
    s.put('c/notes/A.md', '')
    const c = loadCorpus(s.at('c'))
    expect([c.name, c.rootFile, c.level, c.types, c.records, c.corpora]).toEqual([
      'c',
      null,
      null,
      [],
      [],
      {},
    ])
    expect(c.errors).toHaveLength(1)
  })

  test('records with errors are loaded, marked not valid', () => {
    s.root('c')
    s.put('c/notes/notes.schema.yaml', 'required: [status]\nproperties:\n  status: {}\n')
    s.put('c/notes/Good.md', '---\nstatus: ok\n---\nSee [Bad](Bad.md) and [Broken](Broken.md).\n')
    s.put('c/notes/Bad.md', '---\ntitle: Bad\n---\nBody.\n')
    s.put('c/notes/Broken.md', '---\nstatus: [\n---\nStill here.\n')
    const c = loadCorpus(s.at('c'))
    expect(c.errors).toHaveLength(2)
    expect(c.records.map((r) => [r.id, r.valid, r.data, r.body])).toEqual([
      ['Bad', false, { title: 'Bad' }, 'Body.\n'],
      ['Broken', false, {}, 'Still here.\n'],
      ['Good', true, { status: 'ok' }, 'See [Bad](Bad.md) and [Broken](Broken.md).\n'],
    ])
    expect(getRecord(c, 'notes', 'Good')?.links.map((l) => l.target.id)).toEqual(['Bad', 'Broken'])
    expect(getRecord(c, 'notes', 'Bad')?.incoming).toHaveLength(1)
  })

  test('two files with one id: both load, and the first by path is the record', () => {
    s.root('c')
    s.put('c/notes/notes.schema.yaml', 'properties:\n  about: { x-ref: notes, x-ref-form: id }\n')
    s.put('c/notes/z/a.md', '')
    s.put('c/notes/b/A.md', '')
    s.put('c/notes/Ref.md', '---\nabout: a\n---\n')
    const c = loadCorpus(s.at('c'))
    expect(recordsOf(c, 'notes').map((r) => [r.path, r.valid])).toEqual([
      ['notes/b/A.md', true],
      ['notes/Ref.md', true],
      ['notes/z/a.md', false],
    ])
    expect(getRecord(c, 'notes', 'a')?.path).toBe('notes/b/A.md')
    expect(getRecord(c, 'notes', 'Ref')?.references[0]?.target?.path).toBe('notes/b/A.md')
  })

  test('a reference of a record that is not valid still resolves, and adds no error', () => {
    s.root('c')
    s.put(
      'c/notes/notes.schema.yaml',
      'required: [status]\nproperties:\n  status: {}\n  about: { x-ref: notes, x-ref-form: id }\n',
    )
    s.put('c/notes/A.md', '---\nabout: B\n---\n')
    s.put('c/notes/B.md', '---\nstatus: ok\nabout: Nope\n---\n')
    const c = loadCorpus(s.at('c'))
    expect(c.errors).toEqual([
      'notes/A.md: status: required',
      'notes/B.md: about: "Nope" is not the id of a record of type notes',
    ])
    expect(getRecord(c, 'notes', 'A')?.references[0]?.target?.id).toBe('B')
    expect(getRecord(c, 'notes', 'B')?.incoming).toHaveLength(1)
  })

  test('a named corpus that does not resolve is absent, and the rest loads', () => {
    s.root('c', { references: { org: '../missing' } })
    s.put('c/notes/notes.schema.yaml', 'type: object\n')
    s.put('c/notes/A.md', '')
    const c = loadCorpus(s.at('c'))
    expect(c.errors).toHaveLength(1)
    expect([c.references, c.corpora]).toEqual([{}, {}])
    expect(c.records.map((r) => r.id)).toEqual(['A'])
  })

  test('a type whose schema does not parse keeps its records, unchecked', () => {
    s.root('c')
    s.put('c/notes/notes.schema.yaml', 'type: [\n')
    s.put('c/notes/A.md', '')
    const c = loadCorpus(s.at('c'))
    expect(getType(c, 'notes')).toMatchObject({ schema: null, flattened: null, fields: [] })
    expect(c.records.map((r) => [r.id, r.valid])).toEqual([['A', true]])
  })
})
