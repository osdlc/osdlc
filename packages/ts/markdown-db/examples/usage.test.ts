/**
 * The package used the way a consumer uses it: through its name only. Each
 * export appears here at least once.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  type CorpusReport,
  type Data,
  encodePath,
  findCorpora,
  fold,
  idProblem,
  markdownLink,
  validateCorpus,
} from '@osdlc/markdown-db'

let dir = ''
const put = (rel: string, text: string): void => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), text)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'markdown-db-example-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('reading a corpus', () => {
  test('the README example runs: it finds every corpus under a folder and reports its problems', async () => {
    put('Data/reading-list/markdown-db.md', '---\nmarkdown-db: 0\n---\n')
    put(
      'Data/reading-list/books/books.schema.yaml',
      'type: object\nrequired: [author]\nproperties:\n  author: { type: string }\n',
    )
    put('Data/reading-list/books/Dune.md', '---\nauthor: Frank Herbert\n---\n')

    // The README's ts block, as written. The Vitest alias resolves the package name from any folder.
    const readme = readFileSync(join(import.meta.dirname, '../README.md'), 'utf8')
    const blocks = [...readme.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1] as string)
    expect(blocks).toHaveLength(1)
    put('readme.ts', blocks[0] as string)
    const { check } = (await import(join(dir, 'readme.ts'))) as {
      check: (folder: string) => string[]
    }

    expect(check(join(dir, 'Data'))).toEqual([])
    put('Data/reading-list/books/Emma.md', '---\ntitle: Emma\n---\n')
    expect(check(join(dir, 'Data'))).toEqual(['reading-list: books/Emma.md: author: required'])
  })

  test('findCorpora finds nested corpora; a corpus with no types has an empty report', () => {
    put('c/markdown-db.md', '---\nmarkdown-db: 0\n---\n')
    put('c/inner/markdown-db.yaml', 'markdown-db: 0\nid: inner-db\n')
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
    put('c/markdown-db.md', '---\nmarkdown-db: 0\n---\n')
    put('c/books/books.schema.md', '')
    put('c/books/sf/Dune.md', '---\nauthor: Frank Herbert\n---\n')

    const report = validateCorpus(join(dir, 'c'))
    const dune: Data | undefined = report.records.get('books')?.get('Dune')
    expect(dune).toEqual({ author: 'Frank Herbert' })
    expect(report.files.get('books')?.get('Dune')).toBe('books/sf/Dune.md')
  })

  test('a broken link is an error on the file that holds it', () => {
    put('c/markdown-db.md', '---\nmarkdown-db: 0\n---\nSee [gone](gone.md).\n')
    const { errors } = validateCorpus(join(dir, 'c'))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/^markdown-db\.md: /)
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
