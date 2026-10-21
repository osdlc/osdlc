/**
 * Every export is stable in 0.x. An export tagged `@experimental`, `@beta` or
 * `@alpha` in its TSDoc must be listed in the README's Stability section, and
 * a listed export must carry one of those tags. Nothing is `@deprecated`: a
 * breaking release removes the old API.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from 'vitest'
import ts from 'typescript'

const PACKAGE_DIR = join(import.meta.dirname, '..')
const ENTRIES = ['index.ts', 'lexical-entry.ts', 'node.ts'].map((file) =>
  join(PACKAGE_DIR, 'src', file),
)
const TIERS = new Set(['experimental', 'beta', 'alpha'])

/** The exports of every entry point whose TSDoc names a tier other than stable. */
function taggedExports(): string[] {
  const program = ts.createProgram(ENTRIES, {
    allowImportingTsExtensions: true,
    noEmit: true,
    types: [],
  })
  const checker = program.getTypeChecker()
  const tagged = new Set<string>()
  for (const entry of ENTRIES) {
    const module = checker.getSymbolAtLocation(program.getSourceFile(entry)!)!
    for (const exported of checker.getExportsOfModule(module)) {
      const symbol =
        exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
      const tiered = (symbol.declarations ?? []).some((d) =>
        ts.getJSDocTags(d).some((t) => TIERS.has(t.tagName.text)),
      )
      if (tiered) tagged.add(exported.name)
    }
  }
  return [...tagged].sort()
}

/** The export names in the bullet list of the README's Stability section. */
function readmeListed(): string[] {
  const readme = readFileSync(join(PACKAGE_DIR, 'README.md'), 'utf-8').replaceAll('\r\n', '\n')
  const start = readme.indexOf('\n## Stability\n')
  expect(start).toBeGreaterThan(-1)
  const section = readme.slice(start + 1).split('\n## ')[0]!
  return section
    .split('\n')
    .filter((line) => line.startsWith('- '))
    .flatMap((line) => [...line.matchAll(/`([A-Za-z_$][\w$]*)`/g)].map((m) => m[1]!))
    .sort()
}

test('the README lists exactly the exports tagged @experimental, @beta or @alpha', () => {
  expect(readmeListed()).toEqual(taggedExports())
})

test('no source file tags anything @deprecated', () => {
  for (const file of readdirSync(join(PACKAGE_DIR, 'src')).filter((f) => f.endsWith('.ts'))) {
    expect(readFileSync(join(PACKAGE_DIR, 'src', file), 'utf-8'), file).not.toContain('@deprecated')
  }
})
