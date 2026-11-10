import { describe, expect, test } from 'vitest'
import {
  ATTACHMENT_EXTENSIONS,
  isCanvasPath,
  isMarkdownPath,
  isDelimitedPath,
  isTextualPath,
  noteBasename,
  noteExtension,
  noteFolder,
  noteStem,
  stripMarkdownExt,
} from '../src/paths.ts'

describe('vault path helpers', () => {
  test('display names strip the markdown extension and nothing else', () => {
    expect(noteStem('Projects/Alpha.md')).toBe('Alpha')
    expect(noteStem('Notes/v1.2 comparison.md')).toBe('v1.2 comparison')
    expect(noteStem('assets/paper.pdf')).toBe('paper.pdf')
    expect(stripMarkdownExt('Projects/Alpha.md')).toBe('Projects/Alpha')
    expect(stripMarkdownExt('assets/diagram.svg')).toBe('assets/diagram.svg')
  })

  test('basename / folder / extension agree on edge shapes', () => {
    expect(noteBasename('root.md')).toBe('root.md')
    expect(noteFolder('root.md')).toBe('')
    expect(noteFolder('a/b/c.md')).toBe('a/b')
    expect(noteExtension('a/B.MD')).toBe('md')
    expect(noteExtension('a/.hidden')).toBe('')
    expect(noteExtension('a/none')).toBe('')
  })

  test('classification is case-insensitive and mutually consistent', () => {
    expect(isMarkdownPath('A.MARKDOWN')).toBe(true)
    expect(isCanvasPath('Board.canvas')).toBe(true)
    expect(isTextualPath('Board.canvas')).toBe(true)
    expect(isTextualPath('data.TSV')).toBe(true)
    expect(isDelimitedPath('a/data.csv')).toBe(true)
    expect(isDelimitedPath('a/data.TSV')).toBe(true)
    expect(isDelimitedPath('a/data.csv.md')).toBe(false)
    // Every attachment extension is lowercase, dot-free, and non-markdown.
    for (const ext of ATTACHMENT_EXTENSIONS) {
      expect(ext).toBe(ext.toLowerCase())
      expect(isMarkdownPath(`x.${ext}`)).toBe(false)
    }
  })
})
