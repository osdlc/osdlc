/**
 * Checks on the public surface as a whole: every export is used in
 * examples/, is named in the README and carries a stability line in its TSDoc,
 * the README's code blocks run, and the package has no dependencies.
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { expect, test } from 'vitest'
import ts from 'typescript'

const PACKAGE_DIR = join(import.meta.dirname, '..')
const ENTRY = join(PACKAGE_DIR, 'src', 'index.ts')
const README = readFileSync(join(PACKAGE_DIR, 'README.md'), 'utf-8')
const MANIFEST: { name: string; [field: string]: unknown } = JSON.parse(
  readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf-8'),
)
const PACKAGE_NAME = MANIFEST.name

/** Every export of the entry point, mapped to whether its TSDoc says "Stable in 0.x." */
function taggedExports(): Map<string, boolean> {
  const program = ts.createProgram([ENTRY], {
    allowImportingTsExtensions: true,
    noEmit: true,
    types: [],
  })
  const checker = program.getTypeChecker()
  const module = checker.getSymbolAtLocation(program.getSourceFile(ENTRY)!)!
  const out = new Map<string, boolean>()
  for (const exported of checker.getExportsOfModule(module)) {
    const symbol =
      exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
    const documented = ts
      .displayPartsToString(symbol.getDocumentationComment(checker))
      .includes('Stable in 0.x.')
    out.set(exported.name, documented)
  }
  return out
}

const EXPORTS = taggedExports()

test('the entry point exports something', () => {
  expect(EXPORTS.size).toBeGreaterThan(0)
})

test('every export is used by examples/, which imports the package name only', () => {
  const dir = join(PACKAGE_DIR, 'examples')
  const sources = readdirSync(dir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => readFileSync(join(dir, f), 'utf-8'))
  const imported = new Set<string>()
  const specifiers = new Set<string>()
  for (const [i, source] of sources.entries()) {
    const sf = ts.createSourceFile(`example-${i}.ts`, source, ts.ScriptTarget.Latest)
    for (const statement of sf.statements) {
      if (!ts.isImportDeclaration(statement)) continue
      const specifier = (statement.moduleSpecifier as ts.StringLiteral).text
      specifiers.add(specifier)
      const named = statement.importClause?.namedBindings
      if (specifier !== PACKAGE_NAME || !named || !ts.isNamedImports(named)) continue
      for (const element of named.elements)
        imported.add((element.propertyName ?? element.name).text)
    }
  }
  expect(
    [...specifiers].filter((s) => s !== PACKAGE_NAME && s !== 'vitest' && !s.startsWith('node:')),
  ).toEqual([])
  expect([...EXPORTS.keys()].filter((name) => !imported.has(name))).toEqual([])
})

test('every export says "Stable in 0.x." in its TSDoc', () => {
  expect([...EXPORTS].filter(([, stable]) => !stable).map(([name]) => name)).toEqual([])
})

test('the README names every export', () => {
  // A code span that starts with the name, such as `envVars(prefix)`, names it.
  const named = new Set([...README.matchAll(/`([A-Za-z_$][\w$]*)/g)].map((m) => m[1]!))
  expect([...EXPORTS.keys()].filter((name) => !named.has(name))).toEqual([])
})

// The API listing is typed `typescript`: it is signatures, not runnable code.
test('every README ts block runs against the package', async () => {
  const blocks = [...README.matchAll(/```ts\r?\n([\s\S]*?)```/g)].map((m) => m[1]!)
  expect(blocks.length).toBeGreaterThan(0)
  // The Vitest alias resolves the package name from any directory.
  const dir = mkdtempSync(join(tmpdir(), 'tiered-dirs-readme-'))
  try {
    for (const [i, block] of blocks.entries()) {
      const file = join(dir, `block-${i}.ts`)
      writeFileSync(file, block)
      await import(pathToFileURL(file).href)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the package has no dependencies, and its sources import only node: and relative modules', () => {
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    expect(MANIFEST[field]).toBeUndefined()
  }
  const imported: string[] = []
  for (const file of readdirSync(PACKAGE_DIR).filter((f) => f.endsWith('.ts'))) {
    if (file === 'vitest.config.ts') continue
    const sf = ts.createSourceFile(
      file,
      readFileSync(join(PACKAGE_DIR, file), 'utf-8'),
      ts.ScriptTarget.Latest,
    )
    for (const s of sf.statements) {
      if ((ts.isImportDeclaration(s) || ts.isExportDeclaration(s)) && s.moduleSpecifier) {
        imported.push((s.moduleSpecifier as ts.StringLiteral).text)
      }
    }
  }
  expect(imported.filter((m) => !m.startsWith('node:') && !m.startsWith('./'))).toEqual([])
})
