/**
 * Checks on the public surface as a whole: the export list is pinned, every
 * export is used in examples/ and named in the README, the README's code blocks
 * run, and the package has no dependencies.
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, test } from 'vitest'
import ts from 'typescript'

import * as main from '../index.ts'
import * as lexicalEntry from '../lexical-entry.ts'

const PACKAGE_DIR = join(import.meta.dirname, '..')
// A Windows checkout may have CRLF line ends.
const README = readFileSync(join(PACKAGE_DIR, 'README.md'), 'utf-8').replaceAll('\r\n', '\n')
const MANIFEST: { name: string; [field: string]: unknown } = JSON.parse(
  readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf-8'),
)
const PACKAGE_NAME = MANIFEST.name

interface Entry {
  /** The specifier a consumer imports. */
  specifier: string
  file: string
  runtime: object
  /** The public surface. Changing it is a decision in a diff, not a side effect. */
  values: string[]
  types: string[]
}

const ENTRIES: Entry[] = [
  {
    specifier: PACKAGE_NAME,
    file: join(PACKAGE_DIR, 'index.ts'),
    runtime: main,
    values: [
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
    ],
    types: ['ContainedFile', 'ContainedPath', 'PathErrorKind', 'Resolver'],
  },
  {
    specifier: `${PACKAGE_NAME}/lexical`,
    file: join(PACKAGE_DIR, 'lexical-entry.ts'),
    runtime: lexicalEntry,
    values: ['PathError', 'isUnder', 'toRelative', 'validateRelative'],
    types: ['PathErrorKind'],
  },
]

/** Every export of one entry point, values and types. */
function exportNames(file: string): string[] {
  const program = ts.createProgram([file], {
    allowImportingTsExtensions: true,
    noEmit: true,
    types: [],
  })
  const checker = program.getTypeChecker()
  const module = checker.getSymbolAtLocation(program.getSourceFile(file)!)!
  return checker.getExportsOfModule(module).map((exported) => exported.name)
}

/** Every export of every entry, by name. */
const EXPORTS = new Set(ENTRIES.flatMap((entry) => exportNames(entry.file)))

/** The names an entry shares with the main entry may be imported from either. */
const MAIN_NAMES = new Set([...ENTRIES[0]!.values, ...ENTRIES[0]!.types])

describe.each(ENTRIES)('entry $specifier', (entry) => {
  test('exports exactly the pinned list', () => {
    expect(exportNames(entry.file).sort()).toEqual([...entry.values, ...entry.types].sort())
  })

  test('exports the pinned values at run time', () => {
    expect(Object.keys(entry.runtime).sort()).toEqual([...entry.values].sort())
  })

  test('every export is used by examples/, from this entry or the main one', () => {
    const dir = join(PACKAGE_DIR, 'examples')
    const imported = new Set<string>()
    for (const [i, file] of readdirSync(dir)
      .filter((f) => f.endsWith('.ts'))
      .entries()) {
      const sf = ts.createSourceFile(
        `example-${i}.ts`,
        readFileSync(join(dir, file), 'utf-8'),
        ts.ScriptTarget.Latest,
      )
      for (const statement of sf.statements) {
        if (!ts.isImportDeclaration(statement)) continue
        const named = statement.importClause?.namedBindings
        const specifier = (statement.moduleSpecifier as ts.StringLiteral).text
        if (specifier !== entry.specifier && specifier !== PACKAGE_NAME) continue
        if (!named || !ts.isNamedImports(named)) continue
        for (const element of named.elements) {
          const name = (element.propertyName ?? element.name).text
          // From the main entry, only a name that entry exports counts.
          if (specifier === entry.specifier || MAIN_NAMES.has(name)) imported.add(name)
        }
      }
    }
    expect([...entry.values, ...entry.types].filter((name) => !imported.has(name))).toEqual([])
  })
})

test('examples/ import only this package, vitest and node:', () => {
  const dir = join(PACKAGE_DIR, 'examples')
  const allowed = new Set([...ENTRIES.map((entry) => entry.specifier), 'vitest'])
  const specifiers = new Set<string>()
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const sf = ts.createSourceFile(
      file,
      readFileSync(join(dir, file), 'utf-8'),
      ts.ScriptTarget.Latest,
    )
    for (const statement of sf.statements) {
      if (ts.isImportDeclaration(statement)) {
        specifiers.add((statement.moduleSpecifier as ts.StringLiteral).text)
      }
    }
  }
  expect([...specifiers].filter((s) => !allowed.has(s) && !s.startsWith('node:'))).toEqual([])
})

test('the README names every export', () => {
  // A code span that starts with the name, such as `contains(outer, inner)`, names it.
  const named = new Set([...README.matchAll(/`([A-Za-z_$][\w$]*)/g)].map((m) => m[1]!))
  expect([...EXPORTS].filter((name) => !named.has(name))).toEqual([])
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
