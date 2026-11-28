import { expect, test } from 'vitest'

import {
  CONTENT_KINDS,
  addKindCounts,
  classifyLines,
  countKinds,
  createScannerRegistry,
  detectLanguage,
  emptyKindCounts,
  knownLanguages,
  languageNamed,
  prefixKind,
  splitLines,
  stripBom,
} from '@osdlc/code-stats/scan'

test('the README scan example', () => {
  const registry = createScannerRegistry()
  const scan = registry.scan(
    "import { readFile } from 'node:fs/promises'\n\n/** Reads it. */\nexport const read = (p: string) => readFile(p, 'utf8') // utf-8\n",
    'src/read.ts',
  )
  expect(scan.name).toBe('TypeScript')
  expect(scan.kinds).toEqual(['boilerplate', 'blank', 'doc', 'logic'])
  expect(countKinds(scan.kinds)).toEqual({ logic: 1, boilerplate: 1, comment: 0, doc: 1, blank: 1 })
})

test('the five kinds, and adding counts together', () => {
  expect(CONTENT_KINDS).toEqual(['logic', 'boilerplate', 'comment', 'doc', 'blank'])
  const total = emptyKindCounts()
  addKindCounts(total, countKinds(['logic', 'logic', 'blank']))
  addKindCounts(total, countKinds(['comment', 'logic']))
  expect(total).toEqual({ logic: 3, boilerplate: 0, comment: 1, doc: 0, blank: 1 })
})

test('splitLines reads a text as git counts its lines, and stripBom drops a byte-order mark', () => {
  expect(splitLines('a\r\nb\n')).toEqual(['a', 'b'])
  expect(splitLines('﻿a\n')).toEqual(['a'])
  expect(stripBom('﻿a')).toBe('a')
  expect(stripBom('a')).toBe('a')
})

test('detectLanguage names a file by its path, then by the interpreter on its first line', () => {
  expect(detectLanguage('src/a.ts')?.name).toBe('TypeScript')
  expect(detectLanguage('src/a.d.ts')?.name).toBe('TypeScript Typings')
  expect(detectLanguage('Makefile')?.name).toBe('Makefile')
  expect(detectLanguage('bin/tool', '#!/usr/bin/env python3')?.name).toBe('Python')
  expect(detectLanguage('notes.unknownextension')).toBeNull()
})

test('knownLanguages and languageNamed look a language up by name', () => {
  expect(knownLanguages().size).toBeGreaterThan(300)
  expect(languageNamed('Rust')?.name).toBe('Rust')
  expect(languageNamed('No Such Language')).toBeNull()
})

test('classifyLines reads the lines as one language, and prefixKind reads a single line', () => {
  const rust = languageNamed('Rust')!
  expect(classifyLines(rust, ['use std::fmt;', '// a note', '/// docs', 'fn main() {}'])).toEqual([
    'boilerplate',
    'comment',
    'doc',
    'logic',
  ])
  expect(prefixKind('  // a note')).toBe('comment')
  expect(prefixKind('  # a note', rust)).toBe('logic')
  expect(prefixKind('')).toBe('blank')
})
