import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { extractLinks, markdownLink, matchWikilink, wikilinkIndex } from './links.ts'
import { findCorpora, validateCorpus } from './validate.ts'

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
  dir = mkdtempSync(join(tmpdir(), 'markdown-db-'))
  put(
    'markdown-db.md',
    '---\nmarkdown-db: 0\nformats: [md, yaml, json]\n---\n\nStart with [the notes](notes/notes.schema.json).\n',
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
    assert.equal(name, dir.split('/').pop())
    assert.equal(records.get('notes')?.size, 1)
    assert.ok(records.get('notes')?.has('Note A'))
    assert.equal(records.get('tags')?.size, 1)
    assert.equal(records.get('cards')?.size, 1)
  })

  test('a .yaml or .json root file works', () => {
    rmSync(join(dir, 'markdown-db.md'))
    put('markdown-db.yaml', 'markdown-db: 0\nformats: [md, yaml, json]\n')
    assert.deepEqual(errors(), [])
    rmSync(join(dir, 'markdown-db.yaml'))
    put('markdown-db.json', '{"markdown-db": 0, "formats": ["md", "yaml", "json"]}')
    assert.deepEqual(errors(), [])
  })

  test('two root files fail', () => {
    put('markdown-db.yaml', 'markdown-db: 0\n')
    assert.ok(has(errors(), 'a folder holds one root file'))
  })

  test('a missing root file or an unsupported version fails', () => {
    put('markdown-db.md', '---\nmarkdown-db: 1\n---\n')
    assert.ok(has(errors(), 'markdown-db.md: markdown-db: must be 0'))
    rmSync(join(dir, 'markdown-db.md'))
    assert.ok(has(errors(), 'no markdown-db.md'))
  })

  test('id is optional and must be a string; unknown keys warn', () => {
    put('markdown-db.md', '---\nmarkdown-db: 0\nformats: [md, yaml, json]\nid: notes-app\n---\n')
    assert.equal(run().id, 'notes-app')
    put(
      'markdown-db.md',
      '---\nmarkdown-db: 0\nformats: [md, yaml, json]\nid: 3\ndepends: {}\n---\n',
    )
    const report = run()
    assert.ok(has(report.errors, 'id: must be a non-empty string'))
    assert.ok(has(report.warnings, 'depends: not a markdown-db v0 key'))
  })

  test('formats defaults to md; a record in another format fails', () => {
    put('markdown-db.md', '---\nmarkdown-db: 0\n---\n')
    const e = errors()
    assert.ok(has(e, 'tags/T.yaml: format yaml is not in'))
    assert.ok(has(e, 'cards/C.json: format json is not in'))
    assert.ok(!has(e, 'Note A'))
  })

  test('a bad formats list fails', () => {
    put('markdown-db.md', '---\nmarkdown-db: 0\nformats: [md, toml]\n---\n')
    assert.ok(has(errors(), 'formats: must list'))
  })

  test('findCorpora finds nested corpora and skips dot folders', () => {
    put('more/inner/markdown-db.yaml', 'markdown-db: 0\n')
    put('.hidden/markdown-db.yaml', 'markdown-db: 0\n')
    const found = findCorpora(dir).map((r) => r.slice(dir.length))
    assert.deepEqual(found, ['', '/more/inner'])
  })

  test('a nested corpus is not part of the outer one', () => {
    put('more/inner/markdown-db.yaml', 'markdown-db: 0\n')
    put('more/inner/notes/notes.schema.json', '{}')
    put('more/inner/notes/Bad.md', '---\nnot: valid here\n---\n')
    assert.deepEqual(errors(), [])
  })

  test('root file names match exactly, whatever the file system', () => {
    put('more/MARKDOWN-DB.md', '---\nmarkdown-db: 0\n---\n')
    put('notes/Note B.md', note('', '[x](../more/MARKDOWN-DB.md)\n'))
    assert.deepEqual(findCorpora(dir), [dir])
    const report = run()
    assert.deepEqual(report.errors, [])
    assert.deepEqual(report.warnings, [])
  })

  test('a corpus inside a type folder fails', () => {
    put('notes/inner/markdown-db.yaml', 'markdown-db: 0\n')
    assert.ok(has(errors(), 'notes/inner: a corpus must not sit inside type folder notes'))
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
    assert.ok(has(errors(), 'cards/C.json: data must be a mapping'))
  })

  test('a .yml file in a type fails', () => {
    put('tags/U.yml', 'label: U\n')
    assert.ok(has(errors(), 'tags/U.yml: use the .yaml extension'))
  })

  test('a record extension in another case fails', () => {
    put('notes/Upper.MD', note())
    put('tags/U.YAML', 'label: U\n')
    put('tags/V.YML', 'label: V\n')
    const e = errors()
    assert.ok(has(e, 'notes/Upper.MD: use the lower-case .md extension'))
    assert.ok(has(e, 'tags/U.YAML: use the lower-case .yaml extension'))
    assert.ok(has(e, 'tags/V.YML: use the .yaml extension'))
  })

  test('two schema files in one type fail', () => {
    put('tags/tags.schema.json', '{}')
    assert.ok(has(errors(), 'a type holds one schema file'))
  })

  test('a type inside a type fails', () => {
    put('notes/sub/sub.schema.json', '{}')
    assert.ok(has(errors(), 'notes/sub: a type folder must not sit inside type notes'))
  })

  test('two types with one name fail', () => {
    put('more/tags/tags.schema.json', '{}')
    assert.ok(has(errors(), 'tags: type name is also used by more/tags'))
  })

  test('a bad schema fails', () => {
    put('tags/tags.schema.yaml', 'type: object\nrequried: [label]\n')
    assert.ok(has(errors(), 'tags/tags.schema.yaml: strict mode: unknown keyword'))
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
  test('a link to a record of the type passes', () => {
    put('notes/Note B.md', note('partner: "[Note A](Note%20A.md)"\n'))
    assert.deepEqual(errors(), [])
  })

  test('a dangling link fails', () => {
    put('notes/Note B.md', note('partner: "[Gone](Gone.md)"\n'))
    assert.ok(has(errors(), 'notes/Note B.md: partner: Gone.md: no such file'))
  })

  test('a link that leaves the corpus fails', () => {
    put('more/inner/markdown-db.yaml', 'markdown-db: 0\n')
    put('notes/Note B.md', note('partner: "[Y](../../Y.md)"\n'))
    assert.ok(has(errors(), 'notes/Note B.md: partner: must link to a notes record in this corpus'))
    put('notes/Note B.md', note('partner: "[Y](../more/inner/Y.md)"\n'))
    assert.ok(has(errors(), 'notes/Note B.md: partner: must link to a notes record in this corpus'))
  })

  test('a link to a record of another type fails', () => {
    put('notes/Note B.md', note('partner: "[T](../tags/T.yaml)"\n'))
    assert.ok(has(errors(), 'partner: tags/T.yaml is not a notes record'))
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

  test('a wikilink resolves, with a warning', () => {
    put('notes/Note B.md', note('partner: "[[Note A]]"\n'))
    const report = run()
    assert.deepEqual(report.errors, [])
    assert.ok(has(report.warnings, 'partner: [[Note A]] is a wikilink'))
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
    put('markdown-db.md', '---\nmarkdown-db: 0\nformats: [md, yaml, json]\n---\n[x](nope.md)\n')
    put('cards/cards.schema.md', '---\n---\n[y](gone.md)\n')
    const e = errors()
    assert.ok(has(e, 'markdown-db.md: body: nope.md: no such file'))
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
    put('more/inner/markdown-db.yaml', 'markdown-db: 0\n')
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
    put('inner/markdown-db.md', '---\nmarkdown-db: 0\n---\n')
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

  test('a wikilink resolves by unique suffix; none or two matches fail', () => {
    put('notes/Note B.md', note('', '[[notes/Note A]] [[note a.md|alias]] ![[T]]\n'))
    const report = run()
    assert.deepEqual(report.errors, [])
    assert.equal(report.warnings.length, 3)
    put('cards/Note A.json', '{}')
    put('notes/Note B.md', note('', '[[Note A]] [[Nobody]]\n'))
    const e = errors()
    assert.ok(has(e, '[[Note A]]: ambiguous, matches cards/Note A.json, notes/Note A.md'))
    assert.ok(has(e, '[[Nobody]]: no file matches'))
  })
})

describe('validate --fix', () => {
  test('rewrites wikilinks in bodies and data as relative links', () => {
    put(
      'notes/Note B.md',
      note("partner: '[[Note A]]'\n", 'See [[tags/T|the tag]] and [[Note A#Usage]].\n'),
    )
    put('cards/C.json', '{"see": "[[Note B]]"}')
    const report = validateCorpus(dir, { fix: true })
    assert.deepEqual(report.fixed.sort(), ['cards/C.json', 'notes/Note B.md'])
    assert.deepEqual(report.errors, [])
    assert.deepEqual(report.warnings, [])
    assert.equal(
      read('notes/Note B.md'),
      note(
        "partner: '[Note A](Note%20A.md)'\n",
        'See [the tag](../tags/T.yaml) and [Note A](Note%20A.md#Usage).\n',
      ),
    )
    assert.equal(read('cards/C.json'), '{"see": "[Note B](../notes/Note%20B.md)"}')
  })

  test('leaves a wikilink that YAML reads as a list, and warns', () => {
    put('notes/Note B.md', note('friends: [[Note A]]\n'))
    const before = read('notes/Note B.md')
    const report = validateCorpus(dir, { fix: true })
    assert.deepEqual(report.fixed, [])
    assert.ok(has(report.warnings, 'notes/Note B.md: wikilinks not rewritten'))
    assert.equal(read('notes/Note B.md'), before)
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

describe('corpora/beta', () => {
  const beta = resolve(import.meta.dirname, '../../corpora/beta')

  test('validates with no warnings', () => {
    const { records, errors, warnings } = validateCorpus(beta)
    assert.deepEqual(errors, [])
    assert.deepEqual(warnings, [])
    assert.equal(records.get('harnesses')?.size, 14)
  })

  test('refuses a license on a closed-source harness, and a successor that is not a harness', () => {
    rmSync(dir, { recursive: true })
    cpSync(beta, dir, { recursive: true })
    const file = 'harnesses/Claude Code.md'
    put(file, read(file).replace('open_source: false\n', 'open_source: false\nlicense: MIT\n'))
    put(
      'harnesses/Gemini CLI.md',
      read('harnesses/Gemini CLI.md').replace('(Antigravity.md)', '(../README.md)'),
    )
    const e = errors()
    assert.ok(has(e, 'harnesses/Claude Code.md: license: not allowed here'))
    assert.ok(has(e, 'harnesses/Gemini CLI.md: successor: README.md is not a harnesses record'))
  })
})
