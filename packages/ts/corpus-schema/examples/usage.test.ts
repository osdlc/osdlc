/**
 * The package used the way a consumer uses it: through its name only. Each
 * export appears here at least once.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  type Backlink,
  type CorpusField,
  type CorpusModel,
  type CorpusRecord,
  type CorpusReport,
  type CorpusType,
  type Data,
  encodePath,
  type FieldRef,
  findCorpora,
  fold,
  getCorpus,
  getRecord,
  getType,
  idProblem,
  loadCorpus,
  type LoadedCorpus,
  type LoadOptions,
  markdownLink,
  npmPackageUrl,
  type PackageUrl,
  packageUrl,
  type RecordLink,
  type RecordReference,
  recordsOf,
  type RecordTarget,
  type RefForm,
  resolveTarget,
  type SyncReport,
  syncCorpus,
  type TypeRef,
  validateCorpus,
} from '@osdlc/corpus-schema'

let dir = ''
const put = (rel: string, text: string): void => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), text)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'corpus-schema-example-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('reading a corpus', () => {
  test('the README example runs: it finds every corpus under a folder and reports its problems', async () => {
    put('Data/reading-list/reading-list.corpus-schema.md', '---\ncorpus-schema: 0\n---\n')
    put(
      'Data/reading-list/books/books.schema.yaml',
      'type: object\nrequired: [author]\nproperties:\n  author: { type: string }\n',
    )
    put('Data/reading-list/books/Dune.md', '---\nauthor: Frank Herbert\n---\n')

    // The README's ts block, as written. The Vitest alias resolves the package name from any folder.
    const readme = readFileSync(join(import.meta.dirname, '../README.md'), 'utf8')
    const blocks = [...readme.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1] as string)
    expect(blocks).toHaveLength(2)
    put('readme.ts', blocks[0] as string)
    const { check } = (await import(join(dir, 'readme.ts'))) as {
      check: (folder: string) => string[]
    }

    expect(check(join(dir, 'Data'))).toEqual([])
    put('Data/reading-list/books/Emma.md', '---\ntitle: Emma\n---\n')
    expect(check(join(dir, 'Data'))).toEqual(['reading-list: books/Emma.md: author: required'])
  })

  test('the README example runs from a relative folder, with a package parent', async () => {
    put('Data/node_modules/acme-books/package.json', '{"name":"acme-books","corpus":"corpus"}')
    put(
      'Data/node_modules/acme-books/corpus/corpus.corpus-schema.md',
      '---\ncorpus-schema: 0\nlevel: 2\n---\n',
    )
    put(
      'Data/node_modules/acme-books/corpus/books/books.schema.yaml',
      'type: object\nrequired: [author]\n',
    )
    put(
      'Data/shelf/shelf.corpus-schema.md',
      '---\ncorpus-schema: 0\nlevel: 2\nextends:\n  lib: acme-books\n---\n',
    )
    put('Data/shelf/novels/novels.schema.yaml', 'x-extends: lib/books\n')
    put('Data/shelf/novels/Emma.md', '---\ntitle: Emma\n---\n')

    const readme = readFileSync(join(import.meta.dirname, '../README.md'), 'utf8')
    const block = [...readme.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1] as string)[0]
    put('readme.ts', block as string)
    const { check } = (await import(join(dir, 'readme.ts'))) as {
      check: (folder: string) => string[]
    }
    const cwd = process.cwd()
    process.chdir(dir)
    try {
      expect(check('Data')).toEqual(['shelf: novels/Emma.md: author: required'])
    } finally {
      process.chdir(cwd)
    }
  })

  test('findCorpora finds nested corpora; a corpus with no types has an empty report', () => {
    put('c/c.corpus-schema.md', '---\ncorpus-schema: 0\n---\n')
    put('c/inner/inner.corpus-schema.yaml', 'corpus-schema: 0\nid: inner-db\n')
    expect(findCorpora(dir)).toEqual([join(dir, 'c'), join(dir, 'c/inner')])
    const report: CorpusReport = validateCorpus(join(dir, 'c/inner'))
    expect([report.name, report.id, report.records.size, report.errors]).toEqual([
      'inner',
      'inner-db',
      0,
      [],
    ])
  })

  test('a report holds each valid record and its file, by type and id', () => {
    put('c/c.corpus-schema.md', '---\ncorpus-schema: 0\n---\n')
    put('c/books/books.schema.md', '')
    put('c/books/sf/Dune.md', '---\nauthor: Frank Herbert\n---\n')

    const report = validateCorpus(join(dir, 'c'))
    const dune: Data | undefined = report.records.get('books')?.get('Dune')
    expect(dune).toEqual({ author: 'Frank Herbert' })
    expect(report.files.get('books')?.get('Dune')).toBe('books/sf/Dune.md')
  })

  test('a broken link is an error on the file that holds it', () => {
    put('c/c.corpus-schema.md', '---\ncorpus-schema: 0\n---\nSee [gone](gone.md).\n')
    const { errors } = validateCorpus(join(dir, 'c'))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/^c\.corpus-schema\.md: /)
  })
})

describe('extends, references and uses', () => {
  test('a corpus builds on a profile type, links to a referenced record and syncs its copy', () => {
    put('profile/profile.corpus-schema.md', '---\ncorpus-schema: 0\nlevel: 2\n---\n')
    put('profile/principles/principles.schema.yaml', 'type: object\nrequired: [statement]\n')
    put(
      'org/org.corpus-schema.md',
      '---\ncorpus-schema: 0\nlevel: 2\nextends:\n  p: ../profile\nuses: [p/principles]\n---\n',
    )
    put('org/principles/Be Kind.md', '---\nstatement: Treat people with care.\n---\n')
    put(
      'team/team.corpus-schema.md',
      '---\ncorpus-schema: 0\nlevel: 2\nextends:\n  p: ../profile\nreferences:\n  org: ../org\n---\n',
    )
    put('team/rules/rules.schema.yaml', 'x-extends: p/principles\n')
    put(
      'team/rules/Review Kindly.md',
      '---\nstatement: Review with care.\n---\nFollows [Be Kind](../_references/org/principles/Be%20Kind.md).\n',
    )

    expect(validateCorpus(join(dir, 'team')).errors).toEqual([
      '_references/org: (copy): missing, and a file links into it; run corpus-schema sync',
    ])
    const sync: SyncReport = syncCorpus(join(dir, 'team'))
    expect(sync.written).toContain('_references/org/principles/Be Kind.md')
    expect(validateCorpus(join(dir, 'team')).errors).toEqual([])
  })

  test('a packaged corpus, its types and its records have package URLs', () => {
    put('pkg/package.json', '{"name":"@acme/org","version":"1.0.0","corpus":"corpus"}')
    put('pkg/corpus/corpus.corpus-schema.md', '---\ncorpus-schema: 0\n---\n')
    const { identity, version } = validateCorpus(join(dir, 'pkg/corpus'))
    expect([identity, version]).toEqual(['pkg:npm/%40acme/org', '1.0.0'])
    expect(npmPackageUrl('@acme/org', version, ['principles', 'Be Kind'])).toBe(
      'pkg:npm/%40acme/org@1.0.0#principles/Be%20Kind',
    )
    const github: PackageUrl = { type: 'github', namespace: ['Acme'], name: 'org', version: 'v3' }
    expect(packageUrl(github)).toBe('pkg:github/acme/org@v3')
  })
})

describe('loading a corpus as data', () => {
  /** A reading list: authors, and books that name their author and link to other books. */
  const readingList = (): string => {
    put('list/list.corpus-schema.md', '---\ncorpus-schema: 0\nformats: [md, yaml]\n---\n')
    put('list/authors/authors.schema.yaml', 'title: Author\ntype: object\n')
    put('list/authors/Frank Herbert.yaml', 'born: 1920\n')
    put(
      'list/books/books.schema.yaml',
      'required: [author]\nproperties:\n  author: { x-ref: authors, x-ref-form: id }\n  title: { type: string }\n',
    )
    put('list/books/Dune.md', '---\nauthor: Frank Herbert\n---\nThe first one.\n')
    put(
      'list/books/Dune Messiah.md',
      '---\nauthor: Frank Herbert\ntitle: Dune Messiah (1969)\n---\nFollows [Dune](Dune.md).\n',
    )
    put('list/books/Lost.md', '---\nauthor: Nobody\n---\n')
    return join(dir, 'list')
  }

  test('the README example runs: what a record refers to, and what refers to it', async () => {
    const root = readingList()
    const readme = readFileSync(join(import.meta.dirname, '../README.md'), 'utf8')
    const block = [...readme.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1] as string)[1]
    put('readme.ts', block as string)
    const { neighbours } = (await import(join(dir, 'readme.ts'))) as {
      neighbours: (root: string, type: string, id: string) => string[]
    }
    expect(neighbours(root, 'books', 'Dune')).toEqual([
      '/author: Frank Herbert',
      'from books/Dune Messiah',
    ])
    expect(neighbours(root, 'books', 'Lost')).toEqual([
      '/author: unresolved, "Nobody" is not the id of a record of type authors',
    ])
  })

  test('a type lists its fields, and a field its x-ref', () => {
    const corpus: LoadedCorpus = loadCorpus(readingList())
    const books: CorpusType | undefined = getType(corpus, 'books')
    const fields: CorpusField[] = books?.fields ?? []
    expect(fields.map((f) => [f.name, f.required])).toEqual([
      ['author', true],
      ['title', false],
    ])
    const ref: FieldRef | null | undefined = fields[0]?.ref
    const form: RefForm | undefined = ref?.form
    const targets: TypeRef[] = ref?.targets ?? []
    expect([form, targets]).toEqual(['id', [{ corpus: '', type: 'authors', name: 'authors' }]])
    expect(getType(corpus, 'authors')?.title).toBe('Author')
  })

  test('a record holds its data, its body, its references, its links and its backlinks', () => {
    const corpus = loadCorpus(readingList())
    const books: CorpusRecord[] = recordsOf(corpus, 'books')
    expect(books.map((b) => [b.id, b.title, b.format])).toEqual([
      ['Dune', 'Dune', 'md'],
      ['Dune Messiah', 'Dune Messiah (1969)', 'md'],
      ['Lost', 'Lost', 'md'],
    ])
    const messiah = getRecord(corpus, 'books', 'dune messiah')
    expect(messiah?.body).toBe('Follows [Dune](Dune.md).\n')
    const reference: RecordReference | undefined = messiah?.references[0]
    const author: RecordTarget = { corpus: '', type: 'authors', id: 'Frank Herbert', path: 'authors/Frank Herbert.yaml' } // prettier-ignore
    expect(reference).toEqual({
      field: 'author',
      pointer: '/author',
      value: 'Frank Herbert',
      form: 'id',
      target: author,
      unresolved: null,
    })
    expect(resolveTarget(corpus, author)?.data).toEqual({ born: 1920 })
    const link: RecordLink | undefined = messiah?.links[0]
    expect([link?.text, link?.target.id]).toEqual(['Dune', 'Dune'])
    const incoming: Backlink[] = getRecord(corpus, 'authors', 'Frank Herbert')?.incoming ?? []
    expect(incoming.map((b) => `${b.from.id} ${b.via} ${b.pointer}`)).toEqual([
      'Dune reference /author',
      'Dune Messiah reference /author',
    ])
  })

  test('the model is JSON: write it, read it back, and look things up in the copy', () => {
    const options: LoadOptions = { bodies: false }
    const corpus = loadCorpus(readingList(), options)
    const copy = JSON.parse(JSON.stringify(corpus)) as LoadedCorpus
    expect(copy).toEqual(corpus)
    expect(getRecord(copy, 'books', 'Dune')?.body).toBeNull()
    // The errors are the validator's, and the corpus still loads.
    expect(copy.errors).toEqual(validateCorpus(corpus.root).errors)
    expect(copy.errors).toHaveLength(1)
  })

  test('a referenced corpus is in the model, by the prefix that names it', () => {
    put('org/org.corpus-schema.md', '---\ncorpus-schema: 0\n---\n')
    put('org/principles/principles.schema.yaml', 'type: object\n')
    put('org/principles/Be Kind.md', '')
    put('team/team.corpus-schema.md', '---\ncorpus-schema: 0\nreferences:\n  org: ../org\n---\n')
    put(
      'team/rules/rules.schema.yaml',
      'properties:\n  follows: { x-ref: org/principles, x-ref-form: id }\n',
    )
    put('team/rules/Review Kindly.md', '---\nfollows: Be Kind\n---\n')

    const team = loadCorpus(join(dir, 'team'))
    expect(team.errors).toEqual([])
    const org: CorpusModel | undefined = getCorpus(team, team.references['org'])
    expect([org?.key, org?.name, org?.records.length]).toEqual(['org', 'org', 1])
    const target = team.records[0]?.references[0]?.target
    expect(target?.corpus).toBe('org')
    expect(resolveTarget(team, target!)?.incoming[0]?.from.id).toBe('Review Kindly')
  })
})

describe('writing records', () => {
  test('check an id and write a link the way the validator reads them', () => {
    expect(idProblem('Claude Code')).toBeUndefined()
    expect(idProblem('a/b')).toBe('holds "/"')
    expect(fold('Kiro')).toBe(fold('KIRO'))
    expect(encodePath('Claude Code.md')).toBe('Claude%20Code.md')
    expect(markdownLink('Claude Code', '../harnesses/Claude Code.md')).toBe(
      '[Claude Code](../harnesses/Claude%20Code.md)',
    )
  })
})
