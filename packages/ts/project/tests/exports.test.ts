/**
 * Checks on the public surface as a whole, for each entry:
 * every export has a documentation comment, every export is used in examples/, and the README's experimental list
 * matches the `@experimental` tags.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'
import ts from 'typescript'

const PACKAGE_DIR = join(import.meta.dirname, '..')
const PACKAGE_NAME = (
  JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf-8')) as { name: string }
).name

const PLUGINS = [
  'node',
  'rust',
  'python',
  'jvm',
  'php',
  'swift',
  'ruby',
  'go',
  'deno',
  'runners',
  'tools',
]

/** One entry point: its source file and the specifier consumers import. */
const ENTRIES = [
  { specifier: PACKAGE_NAME, entry: 'src/index.ts' },
  { specifier: `${PACKAGE_NAME}/builtins`, entry: 'src/builtins.ts' },
  ...['match', 'params', 'duration'].map((name) => ({
    specifier: `${PACKAGE_NAME}/${name}`,
    entry: `src/${name}.ts`,
  })),
  ...PLUGINS.map((name) => ({
    specifier: `${PACKAGE_NAME}/${name}`,
    entry: `src/plugins/${name}/index.ts`,
  })),
]

test('every entry is in package.json exports', () => {
  const pkg = JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf-8')) as {
    exports: Record<string, unknown>
  }
  const declared = Object.keys(pkg.exports).map((key) =>
    key === '.' ? PACKAGE_NAME : `${PACKAGE_NAME}/${key.slice(2)}`,
  )
  expect(declared.sort()).toEqual(ENTRIES.map((e) => e.specifier).sort())
})

const COMPILER_OPTIONS: ts.CompilerOptions = {
  allowImportingTsExtensions: true,
  noEmit: true,
  types: [],
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  module: ts.ModuleKind.ESNext,
}

/** Every export of an entry point, mapped to whether it is tagged `@experimental`. */
function taggedExports(entryFile: string): Map<string, boolean> {
  const program = ts.createProgram([entryFile], COMPILER_OPTIONS)
  const checker = program.getTypeChecker()
  const module = checker.getSymbolAtLocation(program.getSourceFile(entryFile)!)!
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

/** Names imported from each specifier by every file in examples/. */
function importedByExamples(): Map<string, Set<string>> {
  const dir = join(PACKAGE_DIR, 'examples')
  const imported = new Map<string, Set<string>>()
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const source = readFileSync(join(dir, file), 'utf-8')
    for (const ref of moduleReferences(file, source)) {
      const names = imported.get(ref.specifier) ?? new Set<string>()
      for (const name of ref.names) names.add(name)
      imported.set(ref.specifier, names)
    }
  }
  return imported
}

const IMPORTED = importedByExamples()

test('examples/ imports the package name only', () => {
  const allowed = new Set<string>([...ENTRIES.map((e) => e.specifier), 'vitest'])
  const stray = [...IMPORTED.keys()].filter((s) => !allowed.has(s) && !s.startsWith('node:'))
  expect(stray).toEqual([])
})

const README = readFileSync(join(PACKAGE_DIR, 'README.md'), 'utf-8')

for (const { specifier, entry } of ENTRIES) {
  describe(specifier, () => {
    const exports = taggedExports(join(PACKAGE_DIR, entry))

    test('the entry point exports something', () => {
      expect(exports.size).toBeGreaterThan(0)
    })

    test('every export has a documentation comment', () => {
      expect(undocumentedExports(join(PACKAGE_DIR, entry))).toEqual([])
    })

    test('every export is used by examples/', () => {
      const imported = IMPORTED.get(specifier) ?? new Set<string>()
      expect([...exports.keys()].filter((name) => !imported.has(name))).toEqual([])
    })

    test('the README experimental list matches the @experimental tags', () => {
      const tagged = [...exports].filter(([, experimental]) => experimental).map(([name]) => name)
      const marker = `The experimental exports of \`${specifier}\`:`
      const start = README.indexOf(marker)
      if (tagged.length === 0) {
        expect(start).toBe(-1)
        return
      }
      expect(start).toBeGreaterThan(-1)
      const list = README.slice(start).split('\n\n')[1] ?? ''
      const listed = [...list.matchAll(/`([A-Za-z_$][\w$]*)`/g)].map((m) => m[1]!)

      expect(listed.filter((name) => !exports.has(name))).toEqual([])
      expect([...listed].sort()).toEqual([...tagged].sort())
    })
  })
}
