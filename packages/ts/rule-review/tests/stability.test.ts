/**
 * The README's Stability section lists exactly the exports tagged
 * `@experimental` in their TSDoc, so the list and the markers cannot drift.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import ts from 'typescript'
import { expect, test } from 'vitest'

const PACKAGE_DIR = join(import.meta.dirname, '..')
const ENTRY = join(PACKAGE_DIR, 'src', 'index.ts')
const TIERS = new Set(['experimental', 'beta', 'alpha'])

/** One program over the entry, shared by both tests. */
const program = ts.createProgram([ENTRY], {
  allowImportingTsExtensions: true,
  noEmit: true,
  types: [],
})

/** The exports whose TSDoc names a tier other than stable. */
function taggedExports(): string[] {
  const checker = program.getTypeChecker()
  const module = checker.getSymbolAtLocation(program.getSourceFile(ENTRY)!)!
  const tagged: string[] = []
  for (const exported of checker.getExportsOfModule(module)) {
    const symbol =
      exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
    const tiered = (symbol.declarations ?? []).some((d) =>
      ts.getJSDocTags(d).some((t) => TIERS.has(t.tagName.text)),
    )
    if (tiered) tagged.push(exported.name)
  }
  return tagged.sort()
}

/** The export names in the bullet list of the README's Stability section. */
function readmeListed(): string[] {
  const readme = readFileSync(join(PACKAGE_DIR, 'README.md'), 'utf-8').replaceAll('\r\n', '\n')
  const start = readme.indexOf('\n## Stability\n')
  expect(start).toBeGreaterThan(-1)
  const section = readme.slice(start + 1).split('\n## ')[0]!
  // A bullet may wrap; its continuation lines are indented.
  const bullets = section.replace(/\n {2}(?=\S)/g, ' ').split('\n')
  return bullets
    .filter((line) => line.startsWith('- '))
    .flatMap((line) => [...line.matchAll(/`([A-Za-z_$][\w$]*)`/g)].map((m) => m[1]!))
    .sort()
}

test('the README lists exactly the exports tagged @experimental', () => {
  expect(readmeListed()).toEqual(taggedExports())
})

test('no source file tags anything @deprecated', () => {
  for (const file of program.getSourceFiles()) {
    if (!file.fileName.startsWith(join(PACKAGE_DIR, 'src'))) continue
    expect(file.text, file.fileName).not.toMatch(/@deprecated\b/)
  }
})
