/**
 * Builds the example site with `astro build` and checks what it wrote. The build loads the
 * package through its `exports`, so it reads dist/: build the package first.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

const packageDir = fileURLToPath(new URL('..', import.meta.url))
const out = mkdtempSync(join(tmpdir(), 'corpus-site-build-'))
const read = (file: string): string => readFileSync(join(out, file), 'utf8')
const json = (file: string): any => JSON.parse(read(file))

beforeAll(() => {
  execFileSync(
    process.execPath,
    [
      join(packageDir, 'node_modules/astro/bin/astro.mjs'),
      'build',
      '--root',
      'examples/site',
      '--outDir',
      out,
    ],
    { cwd: packageDir, stdio: 'pipe', env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' } },
  )
}, 120_000)

afterAll(() => rmSync(out, { recursive: true, force: true }))

describe('astro build on the example corpus', () => {
  test('writes a home page, an index per type, a page per record and the search page', () => {
    for (const page of [
      'index.html',
      'books/index.html',
      'authors/index.html',
      'notes/index.html',
      'search/index.html',
    ])
      expect(existsSync(join(out, page)), page).toBe(true)
    expect(readdirSync(join(out, 'books')).filter((f) => f !== 'index.html')).toHaveLength(8)
    expect(readdirSync(join(out, 'authors')).filter((f) => f !== 'index.html')).toHaveLength(5)
    expect(existsSync(join(out, 'notes/selection-in-one-paragraph/index.html'))).toBe(true)
  })

  test('writes the data files', () => {
    expect(json('data/corpus.json').types.map((t: { data: string }) => t.data)).toEqual([
      '/data/types/books.json',
      '/data/types/authors.json',
      '/data/types/notes.json',
    ])
    const books = json('data/types/books.json')
    expect(books.count).toBe(8)
    expect(books.columns).toEqual(['author', 'status', 'genres', 'year', 'rating'])
    expect(json('data/records/books/middlemarch.json').title).toBe('Middlemarch')
    expect(json('data/search.json').docs).toHaveLength(16)
    expect(read('data/files/notes/Selection in one paragraph/sketch.txt')).toContain('b c')
  })

  test('the home page names the corpus, its types and the validator verdict', () => {
    const html = read('index.html')
    expect(html).toContain('<title>Reading list</title>')
    expect(html).toContain('A shelf of books, their writers and some notes.')
    expect(html).toContain('16 records in 3 types')
    expect(html).toMatch(/data-color="green"[^>]*>Valid</)
    expect(html).toContain('href="/books/middlemarch/"')
  })

  test('a type index has its rows without script, the controls, and no row data inline', () => {
    const html = read('books/index.html')
    // Sorted by year, newest first, as the config says.
    const rows = [...html.matchAll(/<th scope="row"[^>]*><a href="([^"]+)"/g)].map((m) => m[1])
    expect(rows).toHaveLength(8)
    expect(rows[0]).toBe('/books/middlemarch/')
    expect(html).toContain('astro-island')
    expect(html).toContain('/data/types/books.json')
    expect(html).toContain('Abandoned books stay on the list.')
    expect(html).toMatch(/aria-pressed="false"[^>]*>To read/)
    // The island's props hold the fields, not the records.
    const props = /props="([^"]*)"/.exec(html)![1]!
    expect(props).not.toContain('Walden')
  })

  test('a record page links its references, its body links and its backlinks to pages', () => {
    const html = read('books/middlemarch/index.html')
    expect(html).toContain('<title>Middlemarch · Reading list</title>')
    expect(html).toContain('href="/authors/george-eliot/"')
    expect(html).toContain('href="/books/the-mill-on-the-floss/"')
    expect(html).toContain('Referenced by')
    expect(html).toContain('href="/notes/dorothea-and-the-map/"')
    expect(html).toMatch(/data-color="green"[^>]*>Finished</)
    expect(html).not.toContain('astro-island')
    const note = read('notes/selection-in-one-paragraph/index.html')
    expect(note).toContain('href="/data/files/notes/Selection%20in%20one%20paragraph/sketch.txt"')
  })

  test('the consumer page, the replaced footer and the added stylesheet are in', () => {
    const shelf = read('shelf/index.html')
    expect(shelf).toContain('<title>The shelf in numbers · Reading list</title>')
    expect(shelf).toContain('class="cs-sidebar"')
    expect(shelf).toContain('/data/types/books.json')
    expect(read('index.html')).toContain('an example corpus.')
    const css = readdirSync(join(out, '_astro')).filter((f) => f.endsWith('.css'))
    expect(css.some((f) => read(`_astro/${f}`).includes('#0f6b5c'))).toBe(true)
  })

  test('the pages share one stylesheet and the scripts are few', () => {
    const assets = readdirSync(join(out, '_astro'))
    expect(assets.filter((f) => f.endsWith('.css')).length).toBeLessThanOrEqual(2)
    expect(assets.filter((f) => f.endsWith('.js')).length).toBeLessThanOrEqual(8)
  })
})
