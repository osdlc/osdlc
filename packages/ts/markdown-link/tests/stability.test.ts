/**
 * The README's Stability section says no export is experimental, beta or
 * alpha. This fails when an export's TSDoc names one of those tiers, so the
 * README is updated in the same change.
 */
import { join } from 'node:path'

import { expect, test } from 'vitest'
import ts from 'typescript'

const PACKAGE_DIR = join(import.meta.dirname, '..')
const ENTRIES = ['index.ts'].map((file) => join(PACKAGE_DIR, 'src', file))
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

test('no export carries a stability tag', () => {
  expect(taggedExports()).toEqual([])
})
