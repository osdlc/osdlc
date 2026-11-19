import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, test } from 'vitest'
import { CorpusSiteConfigError, type CorpusSiteConfig } from '../src/config.ts'
import { relatedTables, typeData } from '../src/data.ts'
import { displayPath, fieldSections, toTree } from '../src/display.ts'
import { recordBySlug } from '../src/routes.ts'
import { loadSite, type Site } from '../src/site.ts'
import { shortUrl, treeText } from '../src/value-text.ts'

// Claims rest on results, and results were read from pages that have URLs.
const root = mkdtempSync(join(tmpdir(), 'corpus-site-sources-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const file = (path: string, text: string): void => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}
file('lab.corpus-schema.md', '---\ncorpus-schema: 0\n---\n\n# Lab\n')
file(
  'pages/pages.schema.md',
  '---\ntype: object\nrequired: [urls]\nproperties:\n  urls: { type: array, items: { type: string, format: uri } }\n  by: { type: string }\n  state: { enum: [live, dead] }\n  home: { type: string }\n---\n',
)
file(
  'pages/Guide.md',
  '---\nurls: ["https://www.example.com/docs/guide/"]\nby: Example\nhome: https://example.com\n---\n',
)
file(
  'pages/Old notes.md',
  '---\nurls: ["https://old.example.com/a", "https://old.example.com/b"]\nstate: dead\n---\n',
)
file(
  'results/results.schema.md',
  '---\ntype: object\nrequired: [kind, seen]\nproperties:\n  kind: { enum: [docs, run] }\n  seen: { type: string, format: date }\n  readFrom: { type: array, items: { type: string, x-ref: pages } }\n---\n',
)
file(
  'results/First look.md',
  '---\nkind: docs\nseen: 2026-01-02\nreadFrom:\n  - "[Guide](../pages/Guide.md)"\n  - "[Old notes](../pages/Old%20notes.md)"\n---\n',
)
file('results/A run.md', '---\nkind: run\nseen: 2026-02-03\n---\n')
file(
  'claims/claims.schema.md',
  '---\ntype: object\nproperties:\n  page: { type: string, x-ref: pages }\n  lines: { type: array, items: { type: object, properties: { items: { type: array, items: { type: string } }, note: { type: string } } } }\n---\n',
)
file(
  'claims/It works.md',
  '---\npage: "[Guide](../pages/Guide.md)"\nlines:\n  - items: ["[First look](../results/First%20look.md)", "[A run](../results/A%20run.md)"]\n    note: read and run\n---\n',
)
file('claims/It stops.md', '---\nlines:\n  - items: ["[A run](../results/A%20run.md)"]\n---\n')

const config: CorpusSiteConfig = {
  types: {
    pages: {
      summary: '{urls}',
      columns: ['title', 'urls', 'home'],
      fields: { urls: { mark: { when: { state: 'dead' }, label: 'Dead link', color: 'red' } } },
      related: [{ label: 'Results', from: 'results', via: 'readFrom', columns: ['title', 'kind'] }],
    },
    results: {
      fields: { readFrom: { label: 'Pages', show: ['urls', 'by'] } },
      related: [{ label: 'Claims', from: 'claims', via: 'lines.items', columns: ['title'] }],
    },
    claims: {
      fields: {
        page: { show: '{title} by {by} ({urls})' },
        'lines.items': { linkText: '{seen} / {kind}', show: ['readFrom'] },
      },
      related: [],
    },
  },
}
const lab = (over: CorpusSiteConfig = config): Site => loadSite(root, { config: over })
const site = lab()
const record = (type: string, slug: string) => recordBySlug(site, type, slug)!
const tree = (type: string, slug: string, path: string, over = {}) =>
  toTree(displayPath(site, record(type, slug), path, over))

describe('a URL is a link out', () => {
  test('shortUrl drops the scheme, www and a last slash', () => {
    expect(shortUrl('https://www.example.com/docs/guide/')).toBe('example.com/docs/guide')
    expect(shortUrl('http://example.com')).toBe('example.com')
  })

  test('a URL field and a string that is a URL are external links with short text', () => {
    expect(tree('pages', 'guide', 'urls')).toEqual([
      {
        text: 'example.com/docs/guide',
        url: 'https://www.example.com/docs/guide/',
        external: true,
      },
    ])
    expect(tree('pages', 'guide', 'home')).toEqual({
      text: 'example.com',
      url: 'https://example.com',
      external: true,
    })
    // A link to a record stays inside the site.
    expect(tree('claims', 'it-works', 'page.title')).toEqual({
      text: 'Guide',
      url: '/pages/guide/',
    })
  })

  test('a mark follows each value on the records that match', () => {
    const urls = tree('pages', 'old-notes', 'urls') as { group: unknown[] }[]
    expect(urls.map((u) => u.group[1])).toEqual([
      { text: 'Dead link', color: 'red' },
      { text: 'Dead link', color: 'red' },
    ])
    expect(treeText(urls[0] as never)).toBe('old.example.com/a Dead link')
    // A column with a mark is a tree in the type's data file.
    const data = typeData(site, site.type('pages')!)
    expect(data.fields.find((f) => f.name === 'urls')!.tree).toBe(true)
    expect(data.fields.find((f) => f.name === 'home')!.tree).toBeUndefined()
  })
})

describe('show and linkText', () => {
  test('a list shows fields of the record after its link', () => {
    expect(tree('results', 'first-look', 'readFrom')).toEqual([
      {
        group: [
          { text: 'Guide', url: '/pages/guide/' },
          {
            text: 'example.com/docs/guide',
            url: 'https://www.example.com/docs/guide/',
            external: true,
          },
          'Example',
        ],
      },
      {
        group: [
          { text: 'Old notes', url: '/pages/old-notes/' },
          { text: 'old.example.com/a', url: 'https://old.example.com/a', external: true },
          { text: 'Dead link', color: 'red' },
          { text: 'old.example.com/b', url: 'https://old.example.com/b', external: true },
          { text: 'Dead link', color: 'red' },
        ],
      },
    ])
  })

  test('a template is written out, with the link at {title}', () => {
    expect(treeText(tree('claims', 'it-works', 'page'))).toBe(
      'Guide by Example ( example.com/docs/guide )',
    )
  })

  test('Markdown links inside a list take linkText and show, one level down', () => {
    const items = tree('claims', 'it-works', 'lines.items') as unknown[]
    expect(treeText(items[0] as never)).toBe(
      'Jan 2, 2026 / docs Guide example.com/docs/guide Example Old notes old.example.com/a Dead link old.example.com/b Dead link',
    )
    // A result with no pages is its link alone.
    expect(items[1]).toEqual({ text: 'Feb 3, 2026 / run', url: '/results/a-run/' })
    const lines = fieldSections(site, record('claims', 'it-works'))[0]!.rows.find(
      (row) => row.field.name === 'lines',
    )!
    expect(JSON.stringify(lines.value)).toContain('"text":"Jan 2, 2026 / docs"')
  })

  test('a path goes through Markdown links to the records they name', () => {
    expect(site.namedAt(record('claims', 'it-works'), 'lines.items').map((r) => r.title)).toEqual([
      'First look',
      'A run',
    ])
    expect(site.textOf(record('claims', 'it-works'), 'lines.items.readFrom.by')).toEqual([
      'Example',
    ])
  })
})

describe('related tables', () => {
  test('via may be a path to Markdown links', () => {
    const [claims] = relatedTables(site, record('results', 'a-run'))
    expect(claims!.label).toBe('Claims')
    expect(claims!.table.records.map((r) => r.title)).toEqual(['It stops', 'It works'])
  })

  test('a table changes a column for itself', () => {
    const over: CorpusSiteConfig = {
      types: {
        ...config.types,
        pages: {
          related: [
            {
              label: 'Claims',
              from: 'claims',
              via: 'page',
              columns: ['lines.items'],
              fields: { 'lines.items': { label: 'Seen', show: [] } },
            },
          ],
        },
      },
    }
    const other = lab(over)
    const [claims] = relatedTables(other, recordBySlug(other, 'pages', 'guide')!)
    expect(claims!.table.fields[0]!.label).toBe('Seen')
    expect(claims!.table.records[0]!.values['lines.items']).toEqual([
      { text: 'Jan 2, 2026 / docs', url: '/results/first-look/' },
      { text: 'Feb 3, 2026 / run', url: '/results/a-run/' },
    ])
  })
})

test('the config check names what exists', () => {
  const problems = (types: NonNullable<CorpusSiteConfig['types']>): string[] => {
    try {
      lab({ types })
    } catch (error) {
      return (error as CorpusSiteConfigError).problems
    }
    return []
  }
  expect(
    problems({
      results: {
        fields: {
          readFrom: { show: ['urls', 'nope'], linkText: '{gone}' },
          kind: { show: ['urls'] },
          seen: { mark: { when: { nope: 1 }, label: '', color: 'pink' as never } },
        },
        related: [
          { label: 'A', from: 'claims', via: 'lines.nope', columns: ['title'] },
          {
            label: 'B',
            from: 'claims',
            via: 'lines.items',
            columns: ['title'],
            fields: { page: { show: 3 as never } },
          },
        ],
      },
    }),
  ).toEqual([
    'types.results.related[0].via: type "claims" has no reference field "lines.nope". Reference fields: page',
    'types.results.related[1].fields: "page" is not a column of the table. Columns: title',
    'types.results.related[1].fields.page.show: must be a list of fields, or text with {field} places',
    'types.results.fields.readFrom.show: type "pages" has no field "nope". Fields: urls, by, state, home',
    'types.results.fields.readFrom.linkText: type "pages" has no field "gone". Fields: urls, by, state, home',
    'types.results.fields.kind: "show" and "linkText" are for a field that names records. Reference fields: readFrom',
    'types.results.fields.seen.mark.label: a mark needs a label',
    'types.results.fields.seen.mark.color: "pink" is not a badge colour. Colours: neutral, accent, green, amber, red, blue, purple',
    'types.results.fields.seen.mark.when: type "results" has no field "nope". Fields: kind, seen, readFrom',
  ])
})
