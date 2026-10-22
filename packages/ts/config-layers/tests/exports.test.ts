/**
 * Checks on the public surface as a whole: every export has a documentation
 * comment, every export is used in examples/, and the README's experimental
 * list matches the `@experimental` tags.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'
import ts from 'typescript'

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))
const ENTRY = join(PACKAGE_DIR, 'src', 'index.ts')
const README = readFileSync(join(PACKAGE_DIR, 'README.md'), 'utf-8')
const PACKAGE_NAME = (
  JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf-8')) as { name: string }
).name

const COMPILER_OPTIONS: ts.CompilerOptions = {
  allowImportingTsExtensions: true,
  noEmit: true,
  types: [],
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  module: ts.ModuleKind.ESNext,
}

/** Every export of the entry point, mapped to whether it is tagged `@experimental`. */
function taggedExports(): Map<string, boolean> {
  const program = ts.createProgram([ENTRY], COMPILER_OPTIONS)
  const checker = program.getTypeChecker()
  const module = checker.getSymbolAtLocation(program.getSourceFile(ENTRY)!)!
  const out = new Map<string, boolean>()
  for (const exported of checker.getExportsOfModule(module)) {
    const symbol =
      exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
    const experimental = (symbol.declarations ?? []).some((d) =>
      ts.getJSDocTags(d).some((t) => t.tagName.text === 'experimental'),
    )
    out.set(exported.name, experimental)
  }
  return out
}

/** Names of the entry point's exports that have no documentation comment. */
function undocumentedExports(entryFile: string): string[] {
  const program = ts.createProgram([entryFile], COMPILER_OPTIONS)
  const checker = program.getTypeChecker()
  const module = checker.getSymbolAtLocation(program.getSourceFile(entryFile)!)!
  return checker
    .getExportsOfModule(module)
    .filter((exported) => {
      const symbol =
        exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
      return ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim() === ''
    })
    .map((exported) => exported.name)
}

/** Every module specifier a source file imports or re-exports, with the names it takes. */
function moduleReferences(file: string, source: string): { specifier: string; names: string[] }[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const out: { specifier: string; names: string[] }[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const names: string[] = []
      const clause = node.importClause
      if (clause?.name) names.push('default')
      const bindings = clause?.namedBindings
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) names.push((el.propertyName ?? el.name).text)
      }
      out.push({ specifier: node.moduleSpecifier.text, names })
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      out.push({ specifier: node.moduleSpecifier.text, names: [] })
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      out.push({ specifier: node.arguments[0].text, names: [] })
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

const EXPORTS = taggedExports()

test('the entry point exports something', () => {
  expect(EXPORTS.size).toBeGreaterThan(0)
})

test('every export has a documentation comment', () => {
  expect(undocumentedExports(ENTRY)).toEqual([])
})

test('every export is used by examples/, which imports the package name only', () => {
  const dir = join(PACKAGE_DIR, 'examples')
  const imported = new Set<string>()
  const specifiers = new Set<string>()
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const source = readFileSync(join(dir, f), 'utf-8')
    for (const ref of moduleReferences(f, source)) {
      specifiers.add(ref.specifier)
      if (ref.specifier !== PACKAGE_NAME) continue
      for (const name of ref.names) imported.add(name)
    }
  }
  expect(
    [...specifiers].filter(
      (s) => s !== PACKAGE_NAME && s !== 'vitest' && s !== 'zod' && !s.startsWith('node:'),
    ),
  ).toEqual([])
  expect([...EXPORTS.keys()].filter((name) => !imported.has(name))).toEqual([])
})

test('the README experimental list matches the @experimental tags', () => {
  const start = README.indexOf('The experimental exports:')
  expect(start).toBeGreaterThan(-1)
  const list = README.slice(start).split('\n\n')[1] ?? ''
  const listed = [...list.matchAll(/`([A-Za-z_$][\w$]*)`/g)].map((m) => m[1]!)
  const tagged = [...EXPORTS].filter(([, experimental]) => experimental).map(([name]) => name)

  expect(listed.filter((name) => !EXPORTS.has(name))).toEqual([])
  expect([...listed].sort()).toEqual([...tagged].sort())
})

test('the internal helpers are not exported', () => {
  const hidden = [
    'cell',
    'commentLines',
    'commentOutLines',
    'renderScalarString',
    'enumValues',
    'fieldInfo',
    'kindOf',
    'recordValueType',
    'shapeOf',
    'unwrapSchema',
    'LIBRARY_LAYERS',
    'LOCAL_LAYER',
    'MACHINE_LAYER',
    'PROJECT_LAYER',
  ]
  expect(hidden.filter((name) => EXPORTS.has(name))).toEqual([])
})

test('the unknown-key pieces are exported and tagged experimental', () => {
  for (const name of ['StrippedKeys', 'UnknownKeyUse', 'pathMatcher']) {
    expect(EXPORTS.get(name), name).toBe(true)
  }
})
