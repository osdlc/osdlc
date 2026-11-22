/**
 * Checks on the public surface as a whole: every value export of each entry
 * is used in examples/, which imports the package by name only; the README
 * names every export; and the README's experimental list matches the
 * `@experimental` tags.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import ts from 'typescript'
import { expect, test } from 'vitest'

const PACKAGE_DIR = join(import.meta.dirname, '..')
const README = readFileSync(join(PACKAGE_DIR, 'README.md'), 'utf-8')
const NAME = '@osdlc/story-harness'
const ENTRIES = {
  browser: 'src/browser/index.ts',
  playwright: 'src/playwright/index.ts',
  runner: 'src/runner/index.ts',
}

interface Exported {
  entry: string
  name: string
  experimental: boolean
  value: boolean
}

function exportsOf(): Exported[] {
  const files = Object.values(ENTRIES).map((f) => join(PACKAGE_DIR, f))
  const program = ts.createProgram(files, {
    allowImportingTsExtensions: true,
    noEmit: true,
    types: ['node'],
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
  })
  const checker = program.getTypeChecker()
  const out: Exported[] = []
  for (const [entry, file] of Object.entries(ENTRIES)) {
    const module = checker.getSymbolAtLocation(program.getSourceFile(join(PACKAGE_DIR, file))!)!
    for (const exported of checker.getExportsOfModule(module)) {
      const symbol =
        exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
      out.push({
        entry,
        name: exported.name,
        experimental: (symbol.declarations ?? []).some((d) =>
          ts.getJSDocTags(d).some((t) => t.tagName.text === 'experimental'),
        ),
        value: (symbol.flags & ts.SymbolFlags.Value) !== 0,
      })
    }
  }
  return out
}

const EXPORTS = exportsOf()

test('each entry exports something', () => {
  for (const entry of Object.keys(ENTRIES)) {
    expect(
      EXPORTS.some((e) => e.entry === entry),
      entry,
    ).toBe(true)
  }
})

test('every value export is used by examples/, which imports the package by name only', () => {
  const dir = join(PACKAGE_DIR, 'examples')
  const imported = new Set<string>()
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const sf = ts.createSourceFile(
      file,
      readFileSync(join(dir, file), 'utf-8'),
      ts.ScriptTarget.Latest,
    )
    for (const statement of sf.statements) {
      if (!ts.isImportDeclaration(statement)) continue
      const specifier = (statement.moduleSpecifier as ts.StringLiteral).text
      const local = specifier.startsWith('.') || specifier.startsWith('/')
      expect(local, `${file} imports ${specifier}`).toBe(false)
      if (!specifier.startsWith(`${NAME}/`)) continue
      const named = statement.importClause?.namedBindings
      if (!named || !ts.isNamedImports(named)) continue
      const entry = specifier.slice(NAME.length + 1)
      for (const element of named.elements) {
        imported.add(`${entry}:${(element.propertyName ?? element.name).text}`)
      }
    }
  }
  const missing = EXPORTS.filter((e) => e.value && !imported.has(`${e.entry}:${e.name}`))
  expect(missing.map((e) => `${e.entry}:${e.name}`)).toEqual([])
})

test('the README names every export', () => {
  const named = new Set([...README.matchAll(/`([A-Za-z_$][\w$]*)/g)].map((m) => m[1]!))
  // A table cell such as `openStory(page, baseURL, id, Theme, OpenStoryOptions)` names types too.
  for (const m of README.matchAll(/`[^`]*`/g)) {
    for (const word of m[0].matchAll(/[A-Za-z_$][\w$]*/g)) named.add(word[0])
  }
  for (const m of README.matchAll(/\b[A-Z][A-Za-z]+\b/g)) named.add(m[0])
  expect(EXPORTS.filter((e) => !named.has(e.name)).map((e) => e.name)).toEqual([])
})

test('the README experimental list matches the @experimental tags', () => {
  const start = README.indexOf('The experimental exports:')
  expect(start).toBeGreaterThan(-1)
  const list = README.slice(start).split('\n\n')[1] ?? ''
  const listed = [...list.matchAll(/`([A-Za-z_$][\w$]*)`/g)].map((m) => m[1]!)
  const tagged = EXPORTS.filter((e) => e.experimental).map((e) => e.name)
  expect([...listed].sort()).toEqual([...tagged].sort())
})
