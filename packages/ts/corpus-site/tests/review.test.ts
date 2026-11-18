import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, test } from 'vitest'
import { matrixData } from '../src/data.ts'
import { displayField } from '../src/display.ts'
import { formatDate } from '../src/format.ts'
import { renderBody, renderMarkdown } from '../src/markdown.ts'
import { recordBySlug } from '../src/routes.ts'
import { loadSite } from '../src/site.ts'

// A corpus of items with a link, a url, a language and a record folder that holds an image.
const root = mkdtempSync(join(tmpdir(), 'corpus-site-review-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const file = (path: string, text: string | Buffer): void => {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

file('shelf.corpus-schema.md', '---\ncorpus-schema: 0\n---\n\n# Shelf\n')
file(
  'items/items.schema.md',
  '---\ntype: object\nx-record-file: README.md\nproperties:\n  link: { type: string }\n  site: { type: string, format: uri }\n  lang: { type: string }\n---\n',
)
file(
  'items/Bad link.md',
  '---\nlink: "[docs](javascript:alert(1))"\nsite: "javascript:alert(1)"\n---\n',
)
file(
  'items/Good link.md',
  '---\nlink: "[docs](https://example.com/docs)"\nsite: https://example.com\n---\n',
)
file('items/Mail.md', '---\nlink: "[me](mailto:me@example.com)"\n---\n')
file('items/C.md', '---\nlang: C\n---\n')
file('items/C plus plus.md', '---\nlang: C++\n---\n')
file(
  'items/Folder/README.md',
  '---\nlang: Go\n---\n\n![plan](plan.png)\n\n![[plan.png|200]]\n\n![gone](gone.png)\n',
)
file('items/Folder/plan.png', Buffer.from([137, 80, 78, 71]))

const site = loadSite(root, {
  config: {
    types: {
      items: {
        views: [
          {
            kind: 'matrix',
            label: 'Langs',
            slug: 'langs',
            rows: 'lang',
            columns: 'lang',
            cell: 'title',
          },
        ],
      },
    },
  },
})
const item = (slug: string) => recordBySlug(site, 'items', slug)!
const value = (slug: string, name: string) =>
  displayField(site, item(slug), site.field(item(slug).type, name)!)

describe('links in field values', () => {
  test('a Markdown link to a script is text, not a link', () => {
    expect(value('bad-link', 'link').kind).toBe('text')
    expect(value('bad-link', 'site').kind).toBe('text')
  })

  test('http, https and mailto links stay links', () => {
    expect(value('good-link', 'link')).toMatchObject({
      kind: 'link',
      href: 'https://example.com/docs',
    })
    expect(value('good-link', 'site')).toMatchObject({ kind: 'link' })
    expect(value('mail', 'link')).toMatchObject({ kind: 'link', href: 'mailto:me@example.com' })
  })
})

describe('a record body', () => {
  test('an image in the record folder is drawn from the served file', () => {
    const html = renderBody(site, item('folder'))!
    expect(html).toContain('<img src="/data/files/items/Folder/plan.png"')
    expect(html).toContain('alt="plan"')
    expect(html).toContain('alt="plan.png"')
    expect(html).not.toContain('<markdown-embed')
  })

  test('an image that is not there says so', () => {
    expect(renderBody(site, item('folder'))).toContain('Missing attachment: gone.png')
  })

  test('the text of a code sample is left as written', () => {
    const html = renderMarkdown(
      site,
      '```html\n<a href="Good link.md">x</a>\n```\n\n[link](Good%20link.md)',
      'items/Mail.md',
    )
    expect(html).toContain('&#x3C;a href="Good link.md">')
    expect(html).toContain('href="/items/good-link/"')
  })
})

test('values that slugify alike get a row and a column each', () => {
  const matrix = matrixData(site, site.views()[0]!)
  expect(matrix.columns.map((c) => [c.key, c.title])).toEqual([
    ['c', 'C'],
    ['c-2', 'C++'],
    ['go', 'Go'],
  ])
  expect(matrix.rows.map((r) => r.key)).toEqual(['c', 'c-2', 'go'])
  const cell = (row: string, column: number) =>
    matrix.rows.find((r) => r.key === row)!.cells[column]!.map((c) => c.title)
  expect(cell('c', 0)).toEqual(['C'])
  expect(cell('c', 1)).toEqual([])
  expect(cell('c-2', 1)).toEqual(['C plus plus'])
})

test('a date that does not exist is written as it came', () => {
  const format = { kind: 'date' as const }
  expect(formatDate('2026-02-30', format)).toBe('2026-02-30')
  expect(formatDate('2026-13-01', format)).toBe('2026-13-01')
  expect(formatDate('2026-02-28', format)).toBe('Feb 28, 2026')
})
