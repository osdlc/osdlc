/** The `corpus-query` command, run in process: each command's text and JSON, and each exit code. */
import { checkApp, runApp } from '@osdlc/cli-tool/testing'
import { describe, expect, test } from 'vitest'

import { createApp } from '../src/cli.ts'
import { LIBRARY, XREF } from './support.ts'

const app = createApp()
const run = (...argv: string[]) => runApp(app, ['-C', LIBRARY, ...argv])

test('the command tree renders its help and its schemas', () => {
  expect(checkApp(app)).toEqual([])
})

describe('describe, types, type', () => {
  test('describe', async () => {
    const r = await run('describe')
    expect(r.exit).toBe(0)
    expect(r.out).toBe(
      'library: 9 records, 2 types\n\n' +
        'TYPE     RECORDS  TITLE   DESCRIPTION\n' +
        'authors  3        Author  A person who wrote a book.\n' +
        'books    6        Book    One book on the shelf.\n',
    )
    const json = (await run('describe', '--json')).json()
    expect(json).toMatchObject({ schemaVersion: 1, kind: 'corpus', name: 'library', records: 9 })
  })

  test('types, of the loaded corpus and of every corpus', async () => {
    expect((await run('types')).out).toMatch(/^TYPE +RECORDS +TITLE +DESCRIPTION\nauthors +3 /)
    const all = await runApp(app, ['-C', XREF, 'types', '--corpus', '*'])
    expect(all.out).toMatch(/\nbase\/principles +2\n$/)
  })

  test('type', async () => {
    const r = await run('type', 'books')
    expect(r.out).toMatch(/^books \(Book\): 6 records\nOne book on the shelf\.\n\nFIELD +KIND /)
    expect(r.out).toMatch(/\nauthor +string +yes +-> authors +A link to the autho…\n/)
    expect(r.out).toMatch(/\nstatus +enum +yes +read, reading, queued /)
    expect(r.out).toMatch(/\npublished +string \(date\)\n/)
    const json = (await run('type', 'books', '--json')).json<{ fields: { name: string }[] }>()
    expect(json.fields).toHaveLength(10)
  })
})

describe('find', () => {
  test('a type, then conditions, as a table', async () => {
    const r = await run('find', 'books', 'status=read', 'rating>=4', '-f', 'rating,pages')
    expect(r.exit).toBe(0)
    expect(r.out).toBe(
      'RECORD                           RATING  PAGES\n' +
        'books/The Dispossessed           4.5     387\n' +
        'books/The Left Hand of Darkness  5       304\n' +
        '\n1-2 of 2 records\n',
    )
  })

  test('conditions alone read every type; a value may hold spaces', async () => {
    const r = await run('find', 'author=Ursula Le Guin', '--json')
    expect(r.json<{ total: number }>().total).toBe(2)
    const where = await run(
      'find',
      '-t',
      'books',
      '-w',
      'tags=utopia',
      '-w',
      'status=read',
      '--json',
    )
    expect(where.json<{ records: { id: string }[] }>().records.map((x) => x.id)).toEqual([
      'The Dispossessed',
    ])
  })

  test('search, with the title and the match', async () => {
    const r = await run('find', '-s', 'venice')
    expect(r.out).toMatch(
      /^RECORD +TITLE +MATCH\nbooks\/Invisible Cities +Le città invisibili +Marco Polo/,
    )
  })

  test('paging says where the next page starts', async () => {
    const r = await run('find', 'books', '-n', '2', '--offset', '2', '--sort', '-pages')
    expect(r.out).toMatch(/\n3-4 of 6 records; next page: --offset 4\n$/)
    expect((await run('find', 'books', 'pages>999')).out).toBe('0 records\n')
  })

  test('--json is one document, --output jsonl one record a line, --query a whole query', async () => {
    const json = (await run('find', 'books', '-n', '1', '-f', '*', '--body', '--json')).json<{
      kind: string
      records: { data: unknown; body: string }[]
    }>()
    expect(json.kind).toBe('records')
    expect(json.records[0]).toMatchObject({ data: { status: 'read' }, body: null })
    const lines = (await run('find', 'authors', '--output', 'jsonl')).out.trim().split('\n')
    expect(lines.map((l) => (JSON.parse(l) as { kind: string; id: string }).id)).toEqual([
      'Ada Palmer',
      'Italo Calvino',
      'Ursula Le Guin',
    ])
    const query = JSON.stringify({
      type: 'books',
      where: [{ field: 'pages', op: 'lt', value: 160 }],
    })
    expect((await run('find', '--query', query, '--json')).json<{ total: number }>().total).toBe(1)
  })
})

describe('get, refs, backlinks, traverse, facets', () => {
  test('get prints the record, and --json the whole of it', async () => {
    const r = await run('get', 'books/The Dispossessed')
    expect(r.out).toMatch(
      /^books\/The Dispossessed\nThe Dispossessed\nbooks\/The Dispossessed\.md\n\n\{/,
    )
    expect(r.out).toMatch(/\nAn ambiguous utopia: /)
    expect(r.out).toMatch(
      /\nRefers to \(2\):\n {2}author: authors\/Ursula Le Guin\n {2}body: books\/The Left Hand of Darkness\n$/,
    )
    const two = (await run('get', 'authors', 'Ursula Le Guin', '--no-body', '--json')).json<{
      body?: string
      backlinks: unknown[]
    }>()
    expect(two.body).toBeUndefined()
    expect(two.backlinks).toHaveLength(2)
  })

  test('refs and backlinks', async () => {
    expect((await run('refs', 'books/Too Like the Lightning')).out).toBe(
      'FIELD   RECORD                  TITLE\n' +
        'author  authors/Ada Palmer      Ada Palmer\n' +
        'sequel  books/Seven Surrenders  Seven Surrenders\n' +
        '2 references from books/Too Like the Lightning\n',
    )
    const back = await run('backlinks', 'authors/Ada Palmer', '--json')
    expect(
      back.json<{ backlinks: { from: { id: string } }[] }>().backlinks.map((b) => b.from.id),
    ).toEqual(['Seven Surrenders', 'Too Like the Lightning'])
    const other = await runApp(app, [
      '-C',
      XREF,
      'backlinks',
      'principles/Be Kind',
      '--corpus',
      'org',
    ])
    expect(other.out).toMatch(/1 backlinks to base\/principles\/Be Kind\n$/)
  })

  test('traverse', async () => {
    const r = await run('traverse', 'authors/Ada Palmer', '--in', '--depth', '2')
    expect(r.out).toMatch(/^DEPTH +RECORD +TITLE\n1 +books\/Seven Surrenders /)
    expect(r.out).toMatch(/\n2 records, 3 edges from authors\/Ada Palmer\n$/)
  })

  test('facets', async () => {
    const r = await run('facets', 'status', '-t', 'books', '-w', 'owned=true')
    expect(r.out).toBe(
      'status: 2 values over 3 records\nCOUNT  VALUE\n2      read\n1      queued\n',
    )
  })
})

describe('where the corpus comes from', () => {
  test('the working directory, when it is in or holds one corpus', async () => {
    const inside = await runApp(app, ['types', '--json'], { cwd: `${LIBRARY}/books` })
    expect(inside.json<{ types: unknown[] }>().types).toHaveLength(2)
    const above = await runApp(app, ['describe', '--json'], { cwd: `${LIBRARY}/..` })
    expect(above.json<{ name: string }>().name).toBe('library')
  })

  test('a root the app was made for, which --root overrides', async () => {
    const fixed = createApp({ root: LIBRARY, name: 'library' })
    expect((await runApp(fixed, ['describe', '--json'])).json<{ name: string }>().name).toBe(
      'library',
    )
    const other = await runApp(fixed, ['-C', XREF, 'describe', '--json'])
    expect(other.json<{ name: string }>().name).toBe('references-xref')
    expect(other.err).toMatch(/^library: warning: the corpus has 1 error\(s\)/)
  })
})

describe('exit codes', () => {
  test('1 for no corpus and for no such record', async () => {
    const none = await runApp(app, ['describe'])
    expect(none.exit).toBe(1)
    expect(none.err).toMatch(/^corpus-query: no corpus at, above or below /)
    expect(none.err).toMatch(/Name the corpus folder with --root <dir>\.\n$/)
    const not = await runApp(app, ['-C', `${LIBRARY}/books`, 'describe'])
    expect(not.exit).toBe(1)
    expect(not.err).toMatch(
      /books: not a corpus: no <name>\.corpus-schema\.md, \.yaml or \.json file/,
    )
    const missing = await run('get', 'books/Dune')
    expect(missing.exit).toBe(1)
    expect(missing.err).toMatch(
      /^corpus-query: no record 'Dune' of type 'books' in corpus 'library'\n/,
    )
  })

  test('2 for a command that cannot run as typed, with what exists', async () => {
    const cases: [string[], RegExp][] = [
      [['find', 'shelves'], /no type 'shelves' in corpus 'library'; types: authors, books/],
      [['find', 'books', 'nope=1'], /no field 'nope' in type 'books'; fields: title, author, /],
      [['find', 'books', 'status=done'], /'done' is not a value of field 'status'/],
      [['find', 'books', 'status!done'], /'status!done': '!' must be followed by '=' or '~'/],
      [['find', 'books', 'status=read', 'oops'], /'oops' is not a condition/],
      [['find', 'books', '-n', 'many'], /--limit needs a whole number, 0 or more/],
      [['find', '--query', '{'], /--query is not JSON/],
      [['find', '--corpus', 'nope'], /no corpus 'nope'/],
      [['facets'], /./],
      [['find', '--nope'], /./],
    ]
    for (const [argv, message] of cases) {
      const r = await run(...argv)
      expect([argv, r.exit]).toEqual([argv, 2])
      expect(r.err).toMatch(message)
      expect(r.out).toBe('')
    }
  })

  test('with --json, an error is also a document on stdout', async () => {
    const r = await run('find', 'shelves', '--json')
    expect(r.exit).toBe(2)
    expect(r.json()).toMatchObject({ kind: 'error', code: 'unknown-type', exit: 2 })
    expect((await run('get', 'books/Dune', '--json')).json()).toMatchObject({
      code: 'not-found',
      exit: 1,
    })
  })
})
