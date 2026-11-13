import { describe, expect, test } from 'vitest'
import { corpusData, dataFiles, recordData, searchData, typeData } from '../src/data.ts'
import { backlinkGroups, displayField, fieldSections, recordFiles } from '../src/display.ts'
import { plainText, renderBody, renderMarkdown } from '../src/markdown.ts'
import { recordBySlug, recordPaths, typePaths } from '../src/routes.ts'
import { parseWholeLink, slugify, valueAt } from '../src/site.ts'
import { exampleSite } from './helpers.ts'

const site = exampleSite()
const book = (slug: string) => recordBySlug(site, 'books', slug)!

describe('addresses', () => {
  test('a type and a record get a path from their names', () => {
    expect(site.types.map((t) => t.url)).toEqual(['/authors/', '/books/', '/notes/'])
    expect(book('the-mill-on-the-floss').url).toBe('/books/the-mill-on-the-floss/')
    expect(site.searchUrl).toBe('/search/')
    expect(site.dataUrl('types/books.json')).toBe('/data/types/books.json')
  })

  test('the base goes in front of every address', () => {
    const under = exampleSite({}, '/docs/shelf')
    expect(under.base).toBe('/docs/shelf/')
    expect(under.homeUrl).toBe('/docs/shelf/')
    expect(under.type('books')!.url).toBe('/docs/shelf/books/')
    expect(under.dataUrl('corpus.json')).toBe('/docs/shelf/data/corpus.json')
    expect(renderBody(under, recordBySlug(under, 'books', 'middlemarch')!)).toContain(
      'href="/docs/shelf/books/the-mill-on-the-floss/"',
    )
  })

  test('slugify keeps letters and digits', () => {
    expect(slugify('2026-11-09 Headless help: add-dir')).toBe('2026-11-09-headless-help-add-dir')
    expect(slugify('Café Müller')).toBe('cafe-muller')
    expect(slugify('日本語')).toBe('日本語')
    expect(slugify('!!!')).toBe('record')
  })

  test('the routes list every page once', () => {
    expect(typePaths(site)).toHaveLength(3)
    const paths = recordPaths(site).map((p) => `${p.params.type}/${p.params.record}`)
    expect(paths).toHaveLength(16)
    expect(new Set(paths).size).toBe(16)
    expect(recordBySlug(site, 'books', 'nope')).toBeUndefined()
    expect(recordBySlug(site, 'nope', 'middlemarch')).toBeUndefined()
  })

  test('a hidden type has no pages, and a reference to it is text', () => {
    const hidden = exampleSite({ types: { authors: { hidden: true } } })
    expect(hidden.types.map((t) => t.name)).toEqual(['books', 'notes'])
    expect(hidden.pages()).toHaveLength(11)
    const middlemarch = recordBySlug(hidden, 'books', 'middlemarch')!
    expect(displayField(hidden, middlemarch, hidden.field(middlemarch.type, 'author')!)).toEqual({
      kind: 'text',
      text: 'George Eliot',
      code: false,
    })
  })
})

describe('link rewriting', () => {
  test('a body link to a record points at its page', () => {
    expect(renderBody(site, book('middlemarch'))).toContain('href="/books/the-mill-on-the-floss/"')
    expect(renderBody(site, recordBySlug(site, 'authors', 'mary-shelley')!)).toContain(
      'href="/books/frankenstein/"',
    )
  })

  test('a link to a file of the record folder points at the served file', () => {
    const note = recordBySlug(site, 'notes', 'selection-in-one-paragraph')!
    expect(renderBody(site, note)).toContain(
      'href="/data/files/notes/Selection%20in%20one%20paragraph/sketch.txt"',
    )
    expect(recordFiles(site, note)).toEqual([
      { name: 'sketch.txt', url: '/data/files/notes/Selection%20in%20one%20paragraph/sketch.txt' },
    ])
  })

  test('a link to a schema file points at the type, and an unknown one is marked missing', () => {
    const html = renderMarkdown(
      site,
      '[Books](books/books.schema.md), [gone](books/Gone.md), [out](https://example.com/a.md)',
      'reading-list.corpus-schema.md',
    )
    expect(html).toContain('href="/books/"')
    expect(html).toContain('class="wikilink wikilink-missing" data-wikilink="books/Gone.md"')
    expect(html).toContain('href="https://example.com/a.md"')
  })

  test('resolveLink reads a path from the file that holds it', () => {
    expect(site.resolveLink('', 'books/Walden.md', '../authors/Henry David Thoreau.md')).toEqual({
      url: '/authors/henry-david-thoreau/',
      title: 'Henry David Thoreau',
    })
    expect(site.resolveLink('', 'books/Walden.md', '../../outside.md')).toBeNull()
    expect(site.resolveLink('', 'books/Walden.md', 'Nope.md')).toBeNull()
  })

  test('the body is sanitized', () => {
    const html = renderMarkdown(
      site,
      '<script>alert(1)</script><a href="javascript:alert(1)">x</a>',
      'a.md',
    )
    expect(html).not.toMatch(/<script|href="javascript:/)
  })
})

describe('a record page', () => {
  const withConfig = exampleSite({
    types: {
      books: {
        title: '{title} ({year})',
        summary: '{author}, {status}',
        sections: [{ label: 'Reading', fields: ['status', 'rating'], note: 'So far.' }],
        fields: {
          status: { values: { finished: { label: 'Done', color: 'green', description: 'Read.' } } },
          pages: { hidden: true },
          'edition.format': { label: 'Binding' },
        },
      },
      notes: { title: 'On {about}' },
    },
  })
  const middlemarch = recordBySlug(withConfig, 'books', 'middlemarch')!

  test('the title and the summary are formed from the fields', () => {
    expect(middlemarch.title).toBe('Middlemarch (1871)')
    expect(middlemarch.summary).toBe('George Eliot, Done')
    expect(recordBySlug(withConfig, 'notes', 'selection-in-one-paragraph')!.title).toBe(
      'On On the Origin of Species (1859), The Voyage of the Beagle (1839)',
    )
  })

  test('fields come in sections, then the rest under Details, without hidden or empty ones', () => {
    const sections = fieldSections(withConfig, middlemarch)
    expect(sections.map((s) => [s.label, s.rows.map((r) => r.field.name)])).toEqual([
      ['Reading', ['status', 'rating']],
      ['Details', ['author', 'year', 'fiction', 'genres', 'finished', 'source', 'edition']],
    ])
    expect(fieldSections(site, book('the-last-man'))[0]!.label).toBeNull()
  })

  test('values are drawn by kind', () => {
    const value = (name: string) =>
      displayField(withConfig, middlemarch, withConfig.field(middlemarch.type, name)!)
    expect(value('status')).toEqual({
      kind: 'badge',
      text: 'Done',
      color: 'green',
      description: 'Read.',
    })
    expect(value('author')).toEqual({
      kind: 'link',
      text: 'George Eliot',
      href: '/authors/george-eliot/',
      external: false,
    })
    expect(value('finished')).toEqual({ kind: 'date', text: 'Mar 14, 2026', iso: '2026-03-14' })
    expect(value('fiction')).toEqual({ kind: 'text', text: 'Yes', code: false })
    expect(value('source')).toMatchObject({ kind: 'link', external: true })
    expect(value('genres')).toEqual({
      kind: 'list',
      items: [{ kind: 'badge', text: 'novel', color: 'neutral', description: null }],
    })
    expect(value('edition')).toEqual({
      kind: 'object',
      entries: [
        {
          label: 'Publisher',
          help: null,
          value: { kind: 'text', text: 'Penguin Classics', code: false },
        },
        {
          label: 'Binding',
          help: null,
          value: { kind: 'badge', text: 'paperback', color: 'neutral', description: null },
        },
      ],
    })
  })

  test('backlinks are grouped by type and field, body links last', () => {
    const groups = backlinkGroups(site, book('middlemarch'))
    expect(groups.map((g) => [g.type.label, g.field, g.records.map((r) => r.title)])).toEqual([
      ['Books', null, ['The Mill on the Floss']],
      ['Notes', 'About', ['Dorothea and the map']],
    ])
    expect(
      backlinkGroups(site, recordBySlug(site, 'authors', 'mary-shelley')!).map(
        (g) => g.records.length,
      ),
    ).toEqual([2])
  })
})

describe('the data files', () => {
  test('the layout: the corpus, a file per type, a file per record, the search index, the files', () => {
    const paths = dataFiles(site).map((f) => f.path)
    expect(paths).toHaveLength(1 + 1 + 3 + 16 + 1)
    expect(paths).toContain('corpus.json')
    expect(paths).toContain('search.json')
    expect(paths).toContain('types/books.json')
    expect(paths).toContain('records/books/middlemarch.json')
    expect(paths).toContain('files/notes/Selection in one paragraph/sketch.txt')
    expect(dataFiles(site).every((f) => f.content().length > 0)).toBe(true)
  })

  test('corpus.json names each type and its data file', () => {
    const data = corpusData(site)
    expect(data).toMatchObject({
      version: 1,
      name: 'reading-list',
      title: 'Reading list',
      records: 16,
      errors: 0,
    })
    expect(data.types[1]).toMatchObject({
      name: 'books',
      label: 'Books',
      singular: 'Book',
      count: 8,
      url: '/books/',
      data: '/data/types/books.json',
    })
  })

  test('a type file holds the columns and filters, and no bodies', () => {
    const data = typeData(site, site.type('books')!)
    expect(data.columns).toEqual(['status', 'author', 'year', 'genres'])
    expect(data.fields.map((f) => f.name)).toEqual([
      'author',
      'status',
      'year',
      'pages',
      'fiction',
      'genres',
    ])
    expect(data.fields[1]!.options.map((o) => [o.value, o.count])).toEqual([
      ['to-read', 1],
      ['reading', 2],
      ['finished', 4],
      ['abandoned', 1],
    ])
    expect(data.records[2]).toEqual({
      id: 'Middlemarch',
      url: '/books/middlemarch/',
      title: 'Middlemarch',
      summary: null,
      values: {
        author: 'authors/george-eliot',
        status: 'finished',
        year: 1871,
        pages: 880,
        fiction: true,
        genres: ['novel'],
      },
    })
    expect(data.targets['authors/george-eliot']).toEqual({
      title: 'George Eliot',
      url: '/authors/george-eliot/',
    })
    expect(JSON.stringify(data)).not.toContain('provincial life')
  })

  test('a dotted field named by the config is a column and a filter', () => {
    const nested = exampleSite({
      types: {
        books: {
          columns: ['title', 'edition.format'],
          filters: ['edition.format'],
          fields: { 'edition.format': {} },
        },
      },
    })
    const data = typeData(nested, nested.type('books')!)
    expect(data.fields.map((f) => [f.name, f.label, f.kind, f.control])).toEqual([
      ['edition.format', 'Format', 'enum', 'chips'],
    ])
    expect(data.records[2]!.values).toEqual({ 'edition.format': 'paperback' })
  })

  test('a record file holds the record whole, with what it points at and what points at it', () => {
    const data = recordData(site, book('middlemarch'))
    expect(data).toMatchObject({
      id: 'Middlemarch',
      type: 'books',
      path: 'books/Middlemarch.md',
      valid: true,
    })
    expect(data.data['year']).toBe(1871)
    expect(data.body).toContain('provincial life')
    expect(data.references).toEqual([
      {
        field: 'author',
        key: 'authors/george-eliot',
        title: 'George Eliot',
        url: '/authors/george-eliot/',
      },
      {
        field: null,
        key: 'books/the-mill-on-the-floss',
        title: 'The Mill on the Floss',
        url: '/books/the-mill-on-the-floss/',
      },
    ])
    expect(data.backlinks.map((b) => [b.field, b.title])).toEqual([
      [null, 'The Mill on the Floss'],
      ['about', 'Dorothea and the map'],
    ])
  })

  test('the search index has a row per page: address, title, type, fields, body', () => {
    const data = searchData(site)
    expect(data.types).toEqual(['Author', 'Book', 'Note'])
    expect(data.docs).toHaveLength(16)
    expect(data.docs.find((d) => d[1] === 'Walden')).toEqual([
      '/books/walden/',
      'Walden',
      1,
      'Henry David Thoreau · Finished · 1854 · 320 · essays',
      'Two years beside a pond, told as one.',
    ])
  })
})

test('small helpers', () => {
  expect(valueAt({ a: { b: [1] } }, 'a.b')).toEqual([1])
  expect(valueAt({ a: 1 }, 'a.b')).toBeUndefined()
  expect(parseWholeLink('[Claude Code](../harnesses/Claude%20Code.md)')).toEqual({
    text: 'Claude Code',
    href: '../harnesses/Claude%20Code.md',
  })
  expect(parseWholeLink('[[notes/Idea|an idea]]')).toEqual({ text: 'an idea', href: 'notes/Idea' })
  expect(parseWholeLink('see [x](y.md)')).toBeNull()
  expect(plainText('# Title\n\nSome *bold* [link](a.md) and `code`.\n\n```js\nx\n```')).toBe(
    'Title Some bold link and code . x',
  )
})
