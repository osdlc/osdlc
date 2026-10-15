/**
 * The README's experimental list and the `@experimental` TSDoc tags name the
 * same exports, across every entry point.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from 'bun:test'
import ts from 'typescript'

import { ENTRY_POINTS } from '../examples/support/scenarios.ts'

const PACKAGE_DIR = join(import.meta.dir, '..')
const ENTRIES = ENTRY_POINTS.map((e) => join(PACKAGE_DIR, e.file))

/** Every export of the entry points, mapped to whether it is tagged `@experimental`. */
function taggedExports(): Map<string, boolean> {
  const program = ts.createProgram(ENTRIES, {
    allowImportingTsExtensions: true,
    noEmit: true,
    types: [],
  })
  const checker = program.getTypeChecker()
  const out = new Map<string, boolean>()
  for (const entry of ENTRIES) {
    const module = checker.getSymbolAtLocation(program.getSourceFile(entry)!)!
    for (const exported of checker.getExportsOfModule(module)) {
      const symbol =
        exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
      const experimental = (symbol.declarations ?? []).some((d) =>
        ts.getJSDocTags(d).some((t) => t.tagName.text === 'experimental'),
      )
      out.set(exported.name, experimental)
    }
  }
  return out
}

/** The names in the README's "The experimental exports" list. */
function readmeExperimental(): string[] {
  const readme = readFileSync(join(PACKAGE_DIR, 'README.md'), 'utf-8')
  const start = readme.indexOf('The experimental exports:')
  expect(start).toBeGreaterThan(-1)
  const list = readme.slice(start).split('\n\n')[1] ?? ''
  return list
    .split('\n')
    .filter((l) => l.startsWith('- '))
    .flatMap((l) => [...l.matchAll(/`([A-Za-z_$][\w$]*)`/g)].map((m) => m[1]!))
}

test('the README experimental list matches the @experimental tags', () => {
  const exports = taggedExports()
  const tagged = [...exports].filter(([, experimental]) => experimental).map(([name]) => name)
  const listed = readmeExperimental()

  expect(listed.filter((name) => !exports.has(name))).toEqual([])
  expect([...listed].sort()).toEqual([...tagged].sort())
})
