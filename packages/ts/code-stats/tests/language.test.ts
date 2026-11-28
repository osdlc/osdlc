import { describe, expect, test } from 'vitest'

import { detectLanguage, knownLanguages, languageNamed } from '../src/scan/index.ts'
import { shebangInterpreter } from '../src/scan/language.ts'

const name = (path: string, firstLine?: string) => detectLanguage(path, firstLine)?.name ?? null

describe('detectLanguage', () => {
  test('by extension, longest first and case-insensitive', () => {
    expect(name('a/b.ts')).toBe('TypeScript')
    expect(name('a/b.d.ts')).toBe('TypeScript Typings')
    expect(name('A/B.RS')).toBe('Rust')
    expect(name('x.tf.json')).toBe('Terraform')
    expect(name('types/x.d.mts')).toBe('TypeScript Typings')
    expect(name('tsconfig.json')).toBe('JSONC')
    expect(name('.vscode/settings.json')).toBe('JSONC')
    expect(name('docker/Dockerfile.dev')).toBe('Dockerfile')
  })

  test('by whole file name', () => {
    expect(name('Makefile')).toBe('Makefile')
    expect(name('sub/Dockerfile')).toBe('Dockerfile')
    expect(name('LICENSE')).toBe('License')
    expect(name('.gitignore')).toBe('gitignore')
    expect(name('home/.bashrc')).toBe('BASH')
    expect(name('CMakeLists.txt')).toBe('CMake')
  })

  test('an ambiguous extension takes the preferred language', () => {
    expect(name('x.h')).toBe('C Header')
    expect(name('x.json')).toBe('JSON')
    expect(name('x.yml')).toBe('YAML')
  })

  test('braced SCSS is a language of its own; scc files it under the indented Sass', () => {
    expect(name('a/b.scss')).toBe('SCSS')
    expect(name('a/b.sass')).toBe('Sass')
    expect(languageNamed('Sass')?.extensions).toEqual(['sass'])
  })

  test('by shebang when the name says nothing', () => {
    expect(name('bin/tool', '#!/usr/bin/env node')).toBe('JavaScript')
    expect(name('bin/tool', '#!/usr/bin/python3 -u')).toBe('Python')
    expect(name('bin/tool', '#!/bin/sh')).toBe('Shell')
    expect(name('bin/tool', '#!/usr/bin/env -S bash -e')).toBe('BASH')
    expect(name('bin/tool', '#!/usr/bin/env bun')).toBe('TypeScript')
    expect(name('bin/tool', '#!/usr/bin/env -S uv run --script')).toBe('Python')
    expect(name('bin/tool', '#!/usr/bin/env pwsh')).toBe('Powershell')
    expect(name('bin/tool')).toBeNull()
    expect(name('bin/tool', 'plain text')).toBeNull()
  })

  test('every language has a name and at least one way to be found', () => {
    for (const language of knownLanguages().values()) {
      expect(language.name).not.toBe('')
      const findable =
        language.extensions.length + language.filenames.length + language.shebangs.length
      expect(findable, language.name).toBeGreaterThan(0)
    }
  })
})

describe('the overlay', () => {
  test('the POSIX shells share one reading of quotes and comments; Fish keeps its own', () => {
    for (const shell of ['Shell', 'BASH', 'Zsh', 'Korn Shell']) {
      const language = languageNamed(shell)!
      expect(language.syntax.lineCommentsAtWordStart, shell).toBe(true)
      expect(language.quotes.find((q) => q.start === "'")?.raw, shell).toBe(true)
      expect(language.quotes.find((q) => q.start === '"')?.interpolation, shell).toEqual([
        ['$(', ')'],
        ['${', '}'],
      ])
    }
    expect(languageNamed('Fish')!.syntax.lineCommentsAtWordStart).toBe(false)
  })

  test('interpolation goes on the quotes the overlay names, whichever list they come from', () => {
    for (const name of ['TypeScript', 'JSX', 'Vue']) {
      const quotes = languageNamed(name)!.quotes
      expect(quotes.find((q) => q.start === '`')?.interpolation, name).toEqual([['${', '}']])
      expect(quotes.find((q) => q.start === "'")?.interpolation, name).toBeUndefined()
    }
    const ruby = languageNamed('Ruby')!.quotes
    expect(ruby.find((q) => q.start === '"')?.interpolation).toEqual([['#{', '}']])
    expect(ruby.find((q) => q.start === "'")?.interpolation).toBeUndefined()
  })
})

describe('shebangInterpreter', () => {
  test('reads the program, through env', () => {
    expect(shebangInterpreter('#!/usr/bin/env node')).toBe('node')
    expect(shebangInterpreter('#!/bin/bash -e')).toBe('bash')
    expect(shebangInterpreter('#![allow(dead_code)]')).toBeNull()
    expect(shebangInterpreter('# comment')).toBeNull()
    expect(shebangInterpreter('#!')).toBeNull()
  })
})
