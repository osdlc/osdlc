import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'vitest'

import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { extractLinks, markdownLink, matchWikilink, wikilinkIndex } from '../src/links.ts'
import { findCorpora, validateCorpus } from '../src/validate.ts'

const NOTES_SCHEMA = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 1 },
    site: { type: 'string', format: 'uri' },
    partner: { type: 'string', 'x-ref': 'notes' },
    friends: { type: 'array', items: { type: 'string', 'x-ref': 'notes' } },
    tag: { type: 'string', 'x-ref': 'tags' },
    open: { type: 'boolean' },
    license: { type: 'string' },
  },
  if: { properties: { open: { const: false } }, required: ['open'] },
  // oxlint-disable-next-line unicorn/no-thenable -- `then` is the JSON Schema keyword.
  then: { properties: { license: false } },
})

const TAGS_SCHEMA = `type: object
required: [label]
properties:
  label: { type: string }
`

let dir = ''
const put = (rel: string, text: string): void => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), text)
}
const read = (rel: string): string => readFileSync(join(dir, rel), 'utf8')
const note = (fields = '', body = 'Body.\n'): string => `---\nname: A\n${fields}---\n\n${body}`
const has = (lines: string[], part: string): boolean => lines.some((l) => l.includes(part))
const run = (): ReturnType<typeof validateCorpus> => validateCorpus(dir)
const errors = (): string[] => run().errors

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'corpus-schema-'))
  put(
    'db.corpus-schema.md',
    '---\ncorpus-schema: 0\nformats: [md, yaml, json]\n---\n\nStart with [the notes](notes/notes.schema.json).\n',
  )
  put('notes/notes.schema.json', NOTES_SCHEMA)
  put('notes/Note A.md', note())
  put('tags/tags.schema.yaml', TAGS_SCHEMA)
  put('tags/T.yaml', 'label: T\n')
  put('cards/cards.schema.md', '---\n---\n\nCards have no schema.\n')
  put('cards/C.json', '{"anything": 1}\n')
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('corpus and root file', () => {
  test('a valid corpus passes, with records and schemas in all three formats', () => {
    const { records, errors, warnings, name } = run()
    assert.deepEqual(errors, [])
    assert.deepEqual(warnings, [])
    // The name comes from the root file, not the folder.
    assert.equal(name, 'db')
    assert.equal(records.get('notes')?.size, 1)
    assert.ok(records.get('notes')?.has('Note A'))
    assert.equal(records.get('tags')?.size, 1)
    assert.equal(records.get('cards')?.size, 1)
  })

  test('the report lists the file of each valid record', () => {
    const { files } = run()
    assert.deepEqual([...(files.get('notes') ?? [])], [['Note A', 'notes/Note A.md']])
    assert.deepEqual([...(files.get('tags') ?? [])], [['T', 'tags/T.yaml']])
    assert.deepEqual([...(files.get('cards') ?? [])], [['C', 'cards/C.json']])
  })

  test('a .yaml or .json root file works', () => {
    rmSync(join(dir, 'db.corpus-schema.md'))
    put('db.corpus-schema.yaml', 'corpus-schema: 0\nformats: [md, yaml, json]\n')
    assert.deepEqual(errors(), [])
    rmSync(join(dir, 'db.corpus-schema.yaml'))
    put('db.corpus-schema.json', '{"corpus-schema": 0, "formats": ["md", "yaml", "json"]}')
    assert.deepEqual(errors(), [])
  })

  test('two root files fail', () => {
    put('db.corpus-schema.yaml', 'corpus-schema: 0\n')
    assert.ok(
      has(
        errors(),
        'db.corpus-schema.yaml: (file): a folder holds one root file, and db.corpus-schema.md is one',
      ),
    )
  })

  test('a missing root file or an unsupported version fails', () => {
    put('db.corpus-schema.md', '---\ncorpus-schema: 1\n---\n')
    assert.ok(has(errors(), 'db.corpus-schema.md: corpus-schema: must be 0'))
    rmSync(join(dir, 'db.corpus-schema.md'))
    assert.ok(has(errors(), '.: (folder): no root file'))
  })

  test('a bare corpus-schema.md is not a root file, and a corpus name is lowercase', () => {
    rmSync(join(dir, 'db.corpus-schema.md'))
    put('corpus-schema.md', '---\ncorpus-schema: 0\n---\n')
    assert.deepEqual(findCorpora(dir), [])
    assert.ok(has(errors(), '.: (folder): no root file'))
    rmSync(join(dir, 'corpus-schema.md'))
    put('My DB.corpus-schema.md', '---\ncorpus-schema: 0\nformats: [md, yaml, json]\n---\n')
    assert.deepEqual(findCorpora(dir), [dir])
    assert.deepEqual(errors(), [
      'My DB.corpus-schema.md: (file): the corpus name "My DB" holds only lowercase letters, digits and -',
    ])
  })

  test('the suffix matches exactly, case included', () => {
    rmSync(join(dir, 'db.corpus-schema.md'))
    put('db.Corpus-Schema.md', '---\ncorpus-schema: 0\n---\n')
    assert.deepEqual(findCorpora(dir), [])
  })

  test('id is optional and must be a string; unknown keys warn', () => {
    put(
      'db.corpus-schema.md',
      '---\ncorpus-schema: 0\nformats: [md, yaml, json]\nid: notes-app\n---\n',
    )
    assert.equal(run().id, 'notes-app')
    put(
      'db.corpus-schema.md',
      '---\ncorpus-schema: 0\nformats: [md, yaml, json]\nid: 3\ndepends: {}\n---\n',
    )
    const report = run()
    assert.ok(has(report.errors, 'id: must be a non-empty string'))
    assert.ok(has(report.warnings, 'depends: not a corpus-schema v0 key'))
  })

  test('level is optional, and 2 makes an untyped type an error', () => {
    const root = (extra: string): void =>
      put('db.corpus-schema.md', `---\ncorpus-schema: 0\nformats: [md, yaml, json]\n${extra}---\n`)
    assert.equal(run().level, undefined)
    root('level: 1\n')
    assert.equal(run().level, 1)
    assert.deepEqual(errors(), [])
    root('level: 2\n')
    const report = run()
    assert.equal(report.level, 2)
    assert.deepEqual(report.errors, [
      'cards/cards.schema.md: (schema): empty, but a level 2 corpus gives each type a schema',
    ])
    // The untyped type's records are still read.
    assert.equal(report.records.get('cards')?.size, 1)
    for (const bad of ['0', '3', '"2"']) {
      root(`level: ${bad}\n`)
      const r = run()
      assert.equal(r.level, undefined)
      assert.deepEqual(r.errors, ['db.corpus-schema.md: level: must be 1 or 2'])
    }
  })

  test('dialect and profiles are reserved: they warn as not checked, not as unknown', () => {
    put(
      'db.corpus-schema.md',
      '---\ncorpus-schema: 0\nformats: [md, yaml, json]\ndialect: obsidian\nprofiles: [x]\n---\n',
    )
    const { errors, warnings } = run()
    assert.deepEqual(errors, [])
    assert.deepEqual(warnings, [
      'db.corpus-schema.md: dialect: reserved for a later version; not checked yet',
      'db.corpus-schema.md: profiles: reserved for a later version; not checked yet',
    ])
  })

  test('formats defaults to md; a record in another format fails', () => {
    put('db.corpus-schema.md', '---\ncorpus-schema: 0\n---\n')
    const e = errors()
    assert.ok(has(e, 'tags/T.yaml: format: yaml is not in'))
    assert.ok(has(e, 'cards/C.json: format: json is not in'))
    assert.ok(!has(e, 'Note A'))
  })

  test('a bad formats list fails', () => {
    put('db.corpus-schema.md', '---\ncorpus-schema: 0\nformats: [md, toml]\n---\n')
    assert.ok(has(errors(), 'formats: must list'))
  })

  test('findCorpora finds nested corpora and skips dot folders', () => {
    put('more/inner/inner.corpus-schema.yaml', 'corpus-schema: 0\n')
    put('.hidden/corpus-schema.yaml', 'corpus-schema: 0\n')
    const found = findCorpora(dir).map((r) => r.slice(dir.length))
    assert.deepEqual(found, ['', '/more/inner'])
  })

  test('a nested corpus is not part of the outer one', () => {
    put('more/inner/inner.corpus-schema.yaml', 'corpus-schema: 0\n')
    put('more/inner/notes/notes.schema.json', '{}')
    put('more/inner/notes/Bad.md', '---\nnot: valid here\n---\n')
    assert.deepEqual(errors(), [])
  })

  test('root file names match exactly, whatever the file system', () => {
    put('more/CORPUS-SCHEMA.md', '---\ncorpus-schema: 0\n---\n')
    put('notes/Note B.md', note('', '[x](../more/CORPUS-SCHEMA.md)\n'))
    assert.deepEqual(findCorpora(dir), [dir])
    const report = run()
    assert.deepEqual(report.errors, [])
    assert.deepEqual(report.warnings, [])
  })

  test('a corpus inside a type folder fails', () => {
    put('notes/inner/inner.corpus-schema.yaml', 'corpus-schema: 0\n')
    assert.ok(
      has(errors(), 'notes/inner: (folder): a corpus must not sit inside type folder notes'),
    )
  })
})

describe('types and records', () => {
  test('narrative is ignored: other folders, notes outside types, attachments in a type', () => {
    put('README.md', 'See [nothing](missing.md) and [[ghost]].\n')
    put('guides/howto.md', '---\nname: [not, checked]\n---\n[x](nope.md)\n')
    put('notes/picture.png', 'png')
    assert.deepEqual(errors(), [])
  })

  test('records sit at any depth', () => {
    put('notes/deep/er/Note B.md', note())
    assert.equal(run().records.get('notes')?.size, 2)
  })

  test('a folder holding a record named after it is one record, and owns its other files', () => {
    put(
      'notes/Survey/Survey.md',
      note('', '[script](run.py), [results](out/results.csv), [other](../Pilot/data.csv)\n'),
    )
    put('notes/Survey/run.py', 'print(1)\n')
    put('notes/Survey/out/results.csv', 'a,b\n1,2\n')
    // Neither would pass the notes schema as a record.
    put('notes/Survey/method.md', '---\nstep: 1\n---\n')
    put('notes/Survey/out/raw.json', '[1, 2]\n')
    put('notes/Pilot/Pilot.yaml', 'name: Pilot\n')
    put('notes/Pilot/data.csv', 'x\n')
    const { errors, records, files } = run()
    assert.deepEqual(errors, [])
    assert.deepEqual([...(records.get('notes')?.keys() ?? [])].sort(), [
      'Note A',
      'Pilot',
      'Survey',
    ])
    assert.equal(files.get('notes')?.get('Survey'), 'notes/Survey/Survey.md')
  })

  test('a record file in a format the corpus does not allow still makes a record folder', () => {
    put('db.corpus-schema.md', '---\ncorpus-schema: 0\n---\n')
    rmSync(join(dir, 'notes/notes.schema.json'))
    rmSync(join(dir, 'tags'), { recursive: true })
    rmSync(join(dir, 'cards'), { recursive: true })
    put('notes/notes.schema.md', '---\nrequired: [name]\n---\n')
    put('notes/Survey/Survey.json', '{"name": "Survey"}\n')
    put('notes/Survey/method.md', '---\nstep: 1\n---\n')
    assert.deepEqual(errors(), [
      "notes/Survey/Survey.json: format: json is not in the corpus's formats",
    ])
  })

  test('a folder record id clashes with a file record of the same name', () => {
    put('notes/Survey/Survey.md', note())
    put('notes/survey.md', note())
    assert.ok(has(errors(), 'id: "survey" is also notes/Survey/Survey.md'))
  })

  test('a folder with no record named after it is a plain folder', () => {
    put('notes/Survey/run.py', 'print(1)\n')
    put('notes/Survey/method.md', '---\nstep: 1\n---\n')
    put('notes/Survey/survey.md', note())
    const report = run()
    assert.ok(has(report.errors, 'notes/Survey/method.md: name: required'))
    assert.ok(report.records.get('notes')?.has('survey'))
  })

  test('a record folder inside a record folder fails, and its files belong to the outer one', () => {
    put('notes/Survey/Survey.md', note())
    put('notes/Survey/Pilot/Pilot.md', '---\nstep: 1\n---\n')
    put('notes/Survey/deep/Wave/Wave.md', '---\nstep: 2\n---\n')
    const report = run()
    assert.deepEqual(report.errors, [
      'notes/Survey/Pilot: (folder): a record folder must not sit inside record folder notes/Survey',
      'notes/Survey/deep/Wave: (folder): a record folder must not sit inside record folder notes/Survey',
    ])
    assert.equal(report.records.get('notes')?.size, 2)
  })

  test('a type folder inside a record folder fails', () => {
    put('notes/Survey/Survey.md', note())
    put('notes/Survey/steps/steps.schema.md', '---\n---\n')
    assert.ok(
      has(errors(), 'notes/Survey/steps: (folder): a type folder sits at the corpus root only'),
    )
  })

  test('an empty body passes', () => {
    put('notes/Note A.md', note('', ''))
    assert.deepEqual(errors(), [])
  })

  test('a .md record with no frontmatter has empty data', () => {
    put('cards/Plain.md', 'Just prose.\n')
    put('notes/Plain.md', 'Just prose.\n')
    const e = errors()
    assert.ok(!has(e, 'cards/Plain.md'))
    assert.ok(has(e, 'notes/Plain.md: name: required'))
  })

  test('an unknown field fails', () => {
    put('notes/Note A.md', note('colour: blue\n'))
    assert.ok(has(errors(), 'notes/Note A.md: colour: unknown field'))
  })

  test('a bad URL fails', () => {
    put('notes/Note A.md', note('site: not a url\n'))
    assert.ok(has(errors(), 'notes/Note A.md: site'))
  })

  test('a missing field fails', () => {
    put('tags/T.yaml', 'other: 1\n')
    assert.ok(has(errors(), 'tags/T.yaml: label: required'))
  })

  test('an if/then rule applies: license only when open', () => {
    put('notes/Note A.md', note('open: true\nlicense: MIT\n'))
    assert.deepEqual(errors(), [])
    put('notes/Note A.md', note('open: false\nlicense: MIT\n'))
    const e = errors()
    assert.ok(has(e, 'notes/Note A.md: license: not allowed here'))
    assert.equal(e.length, 1)
  })

  test('data that is not a mapping fails', () => {
    put('cards/C.json', '[1, 2]\n')
    assert.ok(has(errors(), 'cards/C.json: (data): must be a mapping'))
  })

  test('data that does not parse is one (data) line, with the line and column in the file', () => {
    put('notes/Note B.md', '---\nname: B\nopen: [true\n---\n\nBody.\n')
    put('tags/U.yaml', 'label: [U\n')
    put('cards/D.json', '{"a":\n')
    const e = errors()
    for (const file of ['notes/Note B.md', 'tags/U.yaml', 'cards/D.json'])
      assert.ok(has(e, `${file}: (data): `), file)
    assert.ok(e.every((line) => !line.includes('\n')))
    assert.match(
      e.find((l) => l.startsWith('notes/Note B.md'))!,
      / at line 3, column \d+$/,
    )
    assert.match(
      e.find((l) => l.startsWith('tags/U.yaml'))!,
      / at line \d+, column \d+$/,
    )
  })

  test('a .yml file in a type fails', () => {
    put('tags/U.yml', 'label: U\n')
    assert.ok(has(errors(), 'tags/U.yml: (file): use the .yaml extension'))
  })

  test('a record extension in another case fails', () => {
    put('notes/Upper.MD', note())
    put('tags/U.YAML', 'label: U\n')
    put('tags/V.YML', 'label: V\n')
    const e = errors()
    assert.ok(has(e, 'notes/Upper.MD: (file): use the lower-case .md extension'))
    assert.ok(has(e, 'tags/U.YAML: (file): use the lower-case .yaml extension'))
    assert.ok(has(e, 'tags/V.YML: (file): use the .yaml extension'))
  })

  test('two schema files in one type fail', () => {
    put('tags/tags.schema.json', '{}')
    assert.ok(
      has(
        errors(),
        'tags/tags.schema.json: (file): a type holds one schema file, and tags/tags.schema.yaml is one',
      ),
    )
  })

  test('a type inside a type fails', () => {
    put('notes/sub/sub.schema.json', '{}')
    assert.ok(has(errors(), 'notes/sub: (folder): a type folder sits at the corpus root only'))
  })

  test('a type folder below the root fails, and its files are narrative', () => {
    put('research/claims/claims.schema.yaml', TAGS_SCHEMA)
    put('research/claims/C1.md', '---\nnot: checked\n---\n')
    const report = run()
    assert.deepEqual(report.errors, [
      'research/claims: (folder): a type folder sits at the corpus root only',
    ])
    assert.equal(report.records.get('claims'), undefined)
  })

  test("a rejected type's schema still has its links checked", () => {
    put('notes/sub/sub.schema.md', '---\n---\n\nSee [gone](Gone.md).\n')
    put('more/tags/tags.schema.json', '{"description": "[gone](Gone.md)"}')
    const e = errors()
    assert.ok(has(e, 'notes/sub: (folder): a type folder sits at the corpus root only'))
    assert.ok(has(e, 'notes/sub/sub.schema.md: body: Gone.md: no such file'))
    assert.ok(has(e, 'more/tags: (folder): a type folder sits at the corpus root only'))
    assert.ok(has(e, 'more/tags/tags.schema.json: description: Gone.md: no such file'))
  })

  test('two types whose names match fail', () => {
    put('Tags/Tags.schema.json', '{}')
    // On a file system that ignores case, Tags/ is tags/, and there is one type.
    if (readdirSync(dir).filter((d) => d.toLowerCase() === 'tags').length < 2) return
    assert.ok(has(errors(), 'type name is also used by'))
  })

  test("two types may share a schema's $id, and one cannot $ref another", () => {
    const schema = JSON.stringify({ $id: 'https://example.org/thing', type: 'object' })
    put('tags/tags.schema.yaml', '')
    rmSync(join(dir, 'tags/tags.schema.yaml'))
    put('tags/tags.schema.json', schema)
    put('things/things.schema.json', schema)
    put('things/X.json', '{}')
    assert.deepEqual(errors(), [])
    put('things/things.schema.json', JSON.stringify({ $ref: 'https://example.org/thing' }))
    assert.ok(has(errors(), "things/things.schema.json: (schema): can't resolve reference"))
  })

  test('a bad schema fails', () => {
    put('tags/tags.schema.yaml', 'type: object\nrequried: [label]\n')
    assert.ok(has(errors(), 'tags/tags.schema.yaml: (schema): strict mode: unknown keyword'))
  })

  test('valid JSON Schema 2020-12 passes: only unknown keywords are strict', () => {
    // Each of these failed under ajv's full strict mode (strictTypes, strictRequired).
    put('tags/tags.schema.yaml', 'properties:\n  label: { type: string }\n')
    rmSync(join(dir, 'cards/cards.schema.md'))
    put('cards/cards.schema.json', '{"type": "object", "required": ["anything", "other"]}')
    put('notes/notes.schema.json', '{"type": "object", "properties": {"name": {"minLength": 1}}}')
    put('cards/C.json', '{"anything": 1, "other": 2}\n')
    const report = run()
    assert.deepEqual(report.errors, [])
    assert.deepEqual(report.warnings, [])
  })
})

describe('ids', () => {
  test('a forbidden character or a trailing dot or space fails', () => {
    put('notes/A#1.md', note())
    put('notes/B^.md', note())
    put('notes/C..md', note())
    put('notes/D .md', note())
    const e = errors()
    assert.ok(has(e, 'notes/A#1.md: id: "A#1" holds "#"'))
    assert.ok(has(e, 'notes/B^.md: id: "B^" holds "^"'))
    assert.ok(has(e, 'notes/C..md: id: "C." starts or ends with a space or a dot'))
    assert.ok(has(e, 'notes/D .md: id: "D " starts or ends'))
  })

  test('ids are unique after case folding, across folders and extensions', () => {
    put('notes/sub/note a.md', note())
    assert.ok(has(errors(), 'notes/sub/note a.md: id: "note a" is also notes/Note A.md'))
  })

  test('ids are unique after NFC', () => {
    put('notes/Café.md', note())
    put('notes/sub/Café.md', note())
    assert.ok(has(errors(), 'is also notes/Caf'))
  })

  test('ids are unique ignoring the extension', () => {
    put('cards/C.md', '---\n---\n')
    assert.ok(has(errors(), 'cards/C.md: id: "C" is also cards/C.json'))
  })

  test('x-id-pattern narrows ids', () => {
    put('tags/tags.schema.yaml', `x-id-pattern: '^[a-z]+$'\n${TAGS_SCHEMA}`)
    assert.ok(has(errors(), 'tags/T.yaml: id: "T" does not match x-id-pattern'))
    put('tags/tags.schema.yaml', `x-id-pattern: '^[A-Z]+$'\n${TAGS_SCHEMA}`)
    assert.deepEqual(errors(), [])
  })
})

describe('x-ref', () => {
  test('an x-ref to a record folder links to its record file, not the folder or its files', () => {
    put('notes/Survey/Survey.md', note())
    put('notes/Survey/run.py', 'print(1)\n')
    put('notes/Note B.md', note('partner: "[Survey](Survey/Survey.md)"\n'))
    assert.deepEqual(errors(), [])
    put('notes/Note B.md', note('partner: "[Survey](Survey/)"\n'))
    assert.ok(has(errors(), 'partner: notes/Survey is not a record of type notes'))
    put('notes/Note B.md', note('partner: "[run](Survey/run.py)"\n'))
    assert.ok(has(errors(), 'partner: notes/Survey/run.py is not a record of type notes'))
  })

  test('a link to a record of the type passes', () => {
    put('notes/Note B.md', note('partner: "[Note A](Note%20A.md)"\n'))
    assert.deepEqual(errors(), [])
  })

  test('a dangling link fails', () => {
    put('notes/Note B.md', note('partner: "[Gone](Gone.md)"\n'))
    assert.ok(has(errors(), 'notes/Note B.md: partner: Gone.md: no such file'))
  })

  test('a link that leaves the corpus fails', () => {
    put('more/inner/inner.corpus-schema.yaml', 'corpus-schema: 0\n')
    put('notes/Note B.md', note('partner: "[Y](../../Y.md)"\n'))
    assert.ok(
      has(errors(), 'notes/Note B.md: partner: must link to a record of type notes in this corpus'),
    )
    put('notes/Note B.md', note('partner: "[Y](../more/inner/Y.md)"\n'))
    assert.ok(
      has(errors(), 'notes/Note B.md: partner: must link to a record of type notes in this corpus'),
    )
  })

  test('a link to a record of another type fails', () => {
    put('notes/Note B.md', note('partner: "[T](../tags/T.yaml)"\n'))
    assert.ok(has(errors(), 'partner: tags/T.yaml is not a record of type notes'))
    put('notes/Note B.md', note('tag: "[T](../tags/T.yaml)"\n'))
    assert.deepEqual(errors(), [])
  })

  test('a bare id or path is not a link', () => {
    put('notes/Note B.md', note('partner: Note A\n'))
    assert.ok(has(errors(), 'partner: must be one link'))
    put('notes/Note B.md', note('partner: Note A.md\n'))
    assert.ok(has(errors(), 'partner: must be one link'))
  })

  test('each item of an array is checked', () => {
    put('notes/Note B.md', note('friends: ["[A](Note%20A.md)", "[N](Nope.md)"]\n'))
    const e = errors()
    assert.ok(has(e, 'friends: Nope.md: no such file'))
    assert.equal(e.length, 1)
  })

  test('a URL or a link to a heading is not a record file', () => {
    put('notes/Note B.md', note('partner: "[A](https://example.com/A.md)"\n'))
    assert.ok(
      has(errors(), 'notes/Note B.md: partner: must link to the file of a record of type notes'),
    )
    put('notes/Note B.md', note('partner: "[A](#heading)"\n'))
    assert.ok(
      has(errors(), 'notes/Note B.md: partner: must link to the file of a record of type notes'),
    )
  })

  test('a wikilink holding a path resolves; a bare name resolves with a warning', () => {
    put('notes/Note B.md', note('partner: "[[Note A]]"\n'))
    put('notes/more/Note C.md', note('partner: "[[Note A]]"\n'))
    const report = run()
    assert.deepEqual(report.errors, [])
    assert.deepEqual(report.warnings, [
      'notes/more/Note C.md: partner: [[Note A]] is a bare name, not a path from this file; validate --fix rewrites it',
    ])
  })

  test('an x-ref to an unknown type fails', () => {
    put('notes/notes.schema.json', NOTES_SCHEMA.replace('"x-ref":"tags"', '"x-ref":"ghost"'))
    assert.ok(has(errors(), 'tag: x-ref names unknown type "ghost"'))
  })

  test('an x-ref inside a nested object fails', () => {
    put(
      'tags/tags.schema.yaml',
      `${TAGS_SCHEMA}  meta:\n    properties:\n      by: { x-ref: notes }\n`,
    )
    assert.ok(has(errors(), 'properties.meta.properties.by: v0 defines x-ref only'))
  })
})

// Symlinks need a privilege on Windows, and chmod does not stop root or Windows from reading.
const SYMLINKS = { skip: process.platform === 'win32' }
const PERMISSIONS = { skip: process.platform === 'win32' || process.getuid?.() === 0 }

describe('the file system', () => {
  test('a symlink in a type folder is not followed and warns', SYMLINKS, () => {
    put('elsewhere/Note L.md', note())
    symlinkSync(join(dir, 'elsewhere/Note L.md'), join(dir, 'notes/Note L.md'))
    symlinkSync(join(dir, 'elsewhere'), join(dir, 'notes/linked'))
    symlinkSync(join(dir, 'elsewhere'), join(dir, 'linked'))
    const report = run()
    assert.deepEqual(report.errors, [])
    assert.deepEqual(report.warnings.sort(), [
      'notes/Note L.md: (symlink): not followed, so not checked',
      'notes/linked: (symlink): not followed, so not checked',
    ])
    assert.equal(report.records.get('notes')?.has('Note L'), false)
  })

  test('a folder or file that cannot be read is an error, not a throw', PERMISSIONS, () => {
    put('notes/locked/Note C.md', note())
    chmodSync(join(dir, 'notes/locked'), 0o000)
    chmodSync(join(dir, 'tags/T.yaml'), 0o000)
    try {
      const e = errors()
      assert.ok(has(e, 'notes/locked: (folder): cannot read (EACCES)'))
      assert.ok(has(e, 'tags/T.yaml: (file): cannot read (EACCES)'))
      // Inside a corpus, findCorpora leaves the folder to validateCorpus.
      assert.deepEqual(findCorpora(dir), [dir])
    } finally {
      chmodSync(join(dir, 'notes/locked'), 0o755)
      chmodSync(join(dir, 'tags/T.yaml'), 0o644)
    }
  })

  test(
    "a folder that cannot be read in a nested corpus is that corpus's error only",
    PERMISSIONS,
    () => {
      put('inner/inner.corpus-schema.yaml', 'corpus-schema: 0\n')
      put('inner/notes/locked/x.md', '')
      chmodSync(join(dir, 'inner/notes/locked'), 0o000)
      try {
        assert.deepEqual(errors(), [])
        assert.ok(
          has(validateCorpus(join(dir, 'inner')).errors, 'notes/locked: (folder): cannot read'),
        )
      } finally {
        chmodSync(join(dir, 'inner/notes/locked'), 0o755)
      }
    },
  )

  test('a file --fix cannot write is an error, not a throw', PERMISSIONS, () => {
    put('notes/more/Note B.md', note('', 'See [[Note A]].\n'))
    chmodSync(join(dir, 'notes/more/Note B.md'), 0o444)
    try {
      const report = validateCorpus(dir, { fix: true })
      assert.deepEqual(report.fixed, [])
      assert.ok(has(report.errors, 'notes/more/Note B.md: (file): cannot write (EACCES)'))
    } finally {
      chmodSync(join(dir, 'notes/more/Note B.md'), 0o644)
    }
  })

  test('findCorpora throws one line for a folder outside every corpus', PERMISSIONS, () => {
    const outside = mkdtempSync(join(tmpdir(), 'corpus-schema-outside-'))
    mkdirSync(join(outside, 'locked'))
    chmodSync(join(outside, 'locked'), 0o000)
    try {
      assert.throws(() => findCorpora(outside), {
        message: `${join(outside, 'locked')}: cannot read folder (EACCES)`,
      })
    } finally {
      chmodSync(join(outside, 'locked'), 0o755)
      rmSync(outside, { recursive: true, force: true })
    }
  })
})

describe('links', () => {
  test('relative links in bodies are checked literally', () => {
    put(
      'notes/Note B.md',
      note('', 'See [A](Note%20A.md), [A](<Note A.md>) and [T](../tags/T.yaml#x).\n'),
    )
    assert.deepEqual(errors(), [])
    put('notes/Note B.md', note('', 'See [A](note%20a.md).\n'))
    assert.ok(has(errors(), 'notes/Note B.md: body: note%20a.md: no such file'))
  })

  test('links in the root file and schema bodies are checked', () => {
    put(
      'db.corpus-schema.md',
      '---\ncorpus-schema: 0\nformats: [md, yaml, json]\n---\n[x](nope.md)\n',
    )
    put('cards/cards.schema.md', '---\n---\n[y](gone.md)\n')
    const e = errors()
    assert.ok(has(e, 'db.corpus-schema.md: body: nope.md: no such file'))
    assert.ok(has(e, 'cards/cards.schema.md: body: gone.md: no such file'))
  })

  test('links in any frontmatter string are checked', () => {
    put('cards/C.json', '{"see": {"also": ["[B](Nope.md)"]}}')
    assert.ok(has(errors(), 'cards/C.json: see.also: Nope.md: no such file'))
  })

  test('URLs, fragments, folders and code are not file links', () => {
    put(
      'notes/Note B.md',
      note(
        '',
        '[w](https://example.com) [m](mailto:a@b.c) [h](#top) [d](../tags/)\n\n`[c](nope.md)`\n\n```\n[f](nope.md) [[nope]]\n```\n',
      ),
    )
    const report = run()
    assert.deepEqual(report.errors, [])
    assert.deepEqual(report.warnings, [])
  })

  test('an absolute path fails', () => {
    put('notes/Note B.md', note('', '[a](/notes/Note%20A.md)\n'))
    assert.ok(has(errors(), 'links in a corpus must be relative'))
  })

  test('a link out of the corpus or into a nested one warns', () => {
    put('more/inner/inner.corpus-schema.yaml', 'corpus-schema: 0\n')
    put('notes/Note B.md', note('', '[o](../../elsewhere.md) [i](../more/inner/x.md)\n'))
    const report = run()
    assert.deepEqual(report.errors, [])
    assert.equal(report.warnings.filter((w) => w.includes('leaves the corpus')).length, 2)
  })

  test('a link into a dot path or node_modules warns that it leaves the corpus', () => {
    put('.config/x.md', 'x\n')
    put('node_modules/y.md', 'y\n')
    put('notes/Note B.md', note('', '[c](../.config/x.md) [n](../node_modules/y.md)\n'))
    const report = run()
    assert.deepEqual(report.errors, [])
    assert.ok(has(report.warnings, '../.config/x.md: leaves the corpus, which excludes dot paths'))
    assert.ok(has(report.warnings, '../node_modules/y.md: leaves the corpus'))
  })

  test('a wikilink into a nested corpus warns, as the Markdown link does', () => {
    put('inner/inner.corpus-schema.md', '---\ncorpus-schema: 0\n---\n')
    put('inner/N.md', 'N\n')
    put('notes/Note B.md', note('', '[[inner/N]] and [x](../inner/N.md)\n'))
    const report = run()
    assert.deepEqual(report.errors, [])
    assert.ok(has(report.warnings, '[[inner/N]]: leaves the corpus'))
    assert.ok(has(report.warnings, '../inner/N.md: leaves the corpus'))
  })

  test('a wikilink that starts with / fails', () => {
    put('notes/Note B.md', note('', '[[/notes/Note A]]\n'))
    assert.ok(has(errors(), '[[/notes/Note A]]: links in a corpus must be relative'))
  })

  test('a wikilink holds a path from its file, with the same case, and needs no extension', () => {
    put(
      'notes/Note B.md',
      note('', '[[Note A]] [[./Note A.md|alias]] ![[../tags/T]] [[../tags/T.yaml]]\n'),
    )
    assert.deepEqual(run().warnings, [])
    // A path in another case is not a path, and its suffix matches nothing.
    put('notes/Note B.md', note('', '[[../Tags/T]]\n'))
    assert.deepEqual(run().errors, ['notes/Note B.md: body: [[../Tags/T]]: no file matches'])
  })

  test('a bare name resolves by unique suffix, with a warning; none or two matches fail', () => {
    put('notes/Note B.md', note('', '[[notes/Note A]] [[note a.md|alias]] ![[T]]\n'))
    const report = run()
    assert.deepEqual(report.errors, [])
    assert.equal(report.warnings.length, 3)
    assert.ok(report.warnings.every((w) => w.includes('is a bare name')))
    put('cards/Note A.json', '{}')
    put('notes/more/Note B.md', note('', '[[Note A]] [[Nobody]]\n'))
    const e = errors()
    assert.ok(has(e, '[[Note A]]: ambiguous, matches cards/Note A.json, notes/Note A.md'))
    assert.ok(has(e, '[[Nobody]]: no file matches'))
  })
})

describe('validate --fix', () => {
  test('rewrites bare names in bodies and data as relative links, and keeps paths', () => {
    put(
      'notes/more/Note B.md',
      note(
        "partner: '[[Note A]]'\n",
        'See [[tags/T|the tag]], [[Note A#Usage]] and [[../Note A]].\n',
      ),
    )
    put('cards/C.json', '{"see": "[[Note B]]"}')
    const report = validateCorpus(dir, { fix: true })
    assert.deepEqual(report.fixed.sort(), ['cards/C.json', 'notes/more/Note B.md'])
    assert.deepEqual(report.errors, [])
    assert.deepEqual(report.warnings, [])
    assert.equal(
      read('notes/more/Note B.md'),
      note(
        "partner: '[Note A](../Note%20A.md)'\n",
        'See [the tag](../../tags/T.yaml), [Note A](../Note%20A.md#Usage) and [[../Note A]].\n',
      ),
    )
    assert.equal(read('cards/C.json'), '{"see": "[Note B](../notes/more/Note%20B.md)"}')
  })

  test('leaves a wikilink that YAML reads as a list, and warns', () => {
    put('notes/more/Note B.md', note('friends: [[Note A]]\n'))
    const before = read('notes/more/Note B.md')
    const report = validateCorpus(dir, { fix: true })
    assert.deepEqual(report.fixed, [])
    assert.ok(has(report.warnings, 'notes/more/Note B.md: wikilinks not rewritten'))
    assert.equal(read('notes/more/Note B.md'), before)
  })
})

describe('links.ts', () => {
  test('extractLinks reads both forms with text, target and fragment', () => {
    const [md, wiki] = extractLinks('[A \\[1\\]](x%20y.md#h "t") then ![[p/q#r|S]]')
    assert.deepEqual(
      { ...md, start: 0, end: 0 },
      {
        kind: 'markdown',
        embed: false,
        text: 'A [1]',
        target: 'x%20y.md',
        fragment: 'h',
        start: 0,
        end: 0,
      },
    )
    assert.equal(wiki?.kind, 'wiki')
    assert.equal(wiki?.embed, true)
    assert.equal(wiki?.target, 'p/q')
    assert.equal(wiki?.fragment, 'r')
    assert.equal(wiki?.text, 'S')
  })

  test('matchWikilink matches whole segments only', () => {
    const files = wikilinkIndex(['a/Claude Code.md', 'b/Old Claude Code.md', 'c/x.yaml'])
    assert.deepEqual(matchWikilink('claude code', files), ['a/Claude Code.md'])
    assert.deepEqual(matchWikilink('x', files), ['c/x.yaml'])
  })

  test('markdownLink encodes the path and escapes the text', () => {
    assert.equal(markdownLink('A [b]', '../x y (1).md'), '[A \\[b\\]](../x%20y%20%281%29.md)')
  })
})

describe('index exports for record writers', () => {
  test('idProblem, fold, encodePath and markdownLink are public', async () => {
    const api = await import('../src/index.ts')
    assert.equal(api.idProblem('a|b'), 'holds "|"')
    assert.equal(api.idProblem('Fine name'), undefined)
    assert.equal(api.fold('Straße docs'), api.fold('STRASSE docs'))
    assert.equal(api.encodePath('a b/(c)#d'), 'a%20b/%28c%29%23d')
    assert.equal(api.markdownLink('[x]', 'a b.md'), '[\\[x\\]](a%20b.md)')
  })
})
