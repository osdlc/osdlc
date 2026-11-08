/**
 * The package used the way a consumer uses it: through its name only. Each
 * export appears here at least once.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
  test('the README example: find every corpus under a folder and validate it', () => {
    put('Data/reading-list/markdown-db.md', '---\nmarkdown-db: 0\n---\n')
    put(
      'Data/reading-list/books/books.schema.yaml',
      'type: object\nrequired: [author]\nproperties:\n  author: { type: string }\n',
    )
    put('Data/reading-list/books/Dune.md', '---\nauthor: Frank Herbert\n---\n')

    const errors: string[] = []
    for (const root of findCorpora(join(dir, 'Data'))) {
      const report: CorpusReport = validateCorpus(root)
      errors.push(...report.errors)
    }
    expect(errors).toEqual([])
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
