/**
 * Checks on the public surface as a whole: the export list is pinned, every
 * export is used in examples/ and named in the README, the README's code blocks
 * run, and the package has no dependencies.
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'
import ts from 'typescript'

import * as entry from '../index.ts'

const PACKAGE_DIR = join(import.meta.dirname, '..')
const ENTRY = join(PACKAGE_DIR, 'index.ts')
const README = readFileSync(join(PACKAGE_DIR, 'README.md'), 'utf-8')
const MANIFEST: { name: string; [field: string]: unknown } = JSON.parse(
  readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf-8'),
)
const PACKAGE_NAME = MANIFEST.name

/**
 * The public surface. Adding, renaming or removing an export changes this list,
 * so it is a decision in a diff and not a side effect.
 */
const VALUE_EXPORTS = [
  'MAX_LINK_HOPS',
  'PathError',
  'canonicalExistingPrefix',
  'contains',
  'existingPathInside',
  'isInside',
  'lexicalAbsolute',
  'nodeResolver',
  'openContainedFile',
  'readContainedFile',
  'realPathInside',
  'realpathOrSelf',
  'resolveInside',
  'toRelative',
  'tryResolveInside',
  'validateRelative',
]
const TYPE_EXPORTS = ['ContainedFile', 'ContainedPath', 'PathErrorKind', 'Resolver']

/** Every export of the entry point, values and types. */
function exportNames(): string[] {
  const program = ts.createProgram([ENTRY], {
    allowImportingTsExtensions: true,
    noEmit: true,
    types: [],
  })
  const checker = program.getTypeChecker()
  const module = checker.getSymbolAtLocation(program.getSourceFile(ENTRY)!)!
  return checker.getExportsOfModule(module).map((exported) => exported.name)
}

const EXPORTS = exportNames()

test('the entry point exports exactly the pinned list', () => {
  expect([...EXPORTS].sort()).toEqual([...VALUE_EXPORTS, ...TYPE_EXPORTS].sort())
})

test('the values the entry point exports at run time are the pinned values', () => {
  expect(Object.keys(entry).sort()).toEqual([...VALUE_EXPORTS].sort())
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
  expect(EXPORTS.filter((name) => !imported.has(name))).toEqual([])
})

test('the README names every export', () => {
  // A code span that starts with the name, such as `contains(outer, inner)`, names it.
  const named = new Set([...README.matchAll(/`([A-Za-z_$][\w$]*)/g)].map((m) => m[1]!))
  expect(EXPORTS.filter((name) => !named.has(name))).toEqual([])
})

test('every README ts block runs against the package', async () => {
  const blocks = [...README.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1]!)
  expect(blocks.length).toBeGreaterThan(0)
  // The Vitest alias resolves the package name from any directory.
  const dir = mkdtempSync(join(tmpdir(), 'path-guard-readme-'))
  try {
    for (const [i, block] of blocks.entries()) {
      const file = join(dir, `block-${i}.ts`)
      writeFileSync(file, block)
      await import(file)
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
