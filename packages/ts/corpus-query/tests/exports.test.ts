/**
 * Checks on the public API as a whole: every export and every interface field of every entry has
 * TSDoc, the README lists each entry's experimental exports as the `@experimental` tags have
 * them, examples/ uses every export through the package name, and the main entry loads no
 * `node:` module.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import ts from 'typescript'
import { describe, expect, test } from 'vitest'

const PACKAGE_DIR = join(import.meta.dirname, '..')
const README = readFileSync(join(PACKAGE_DIR, 'README.md'), 'utf8')
const ENTRIES = {
  '@osdlc/corpus-query': 'index.ts',
  '@osdlc/corpus-query/node': 'node.ts',
  '@osdlc/corpus-query/rest': 'rest.ts',
  '@osdlc/corpus-query/mcp': 'mcp.ts',
  '@osdlc/corpus-query/cli': 'cli.ts',
}

const program = ts.createProgram(
  Object.values(ENTRIES).map((file) => join(PACKAGE_DIR, 'src', file)),
  {
    allowImportingTsExtensions: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    types: [],
  },
)
const checker = program.getTypeChecker()

/** Each export of an entry, by name, as the symbol it stands for. */
function exportsOf(file: string): Map<string, ts.Symbol> {
  const entry = checker.getSymbolAtLocation(program.getSourceFile(join(PACKAGE_DIR, 'src', file))!)!
  return new Map(
    checker
      .getExportsOfModule(entry)
      .map((s) => [s.name, s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s]),
  )
}

const documented = (s: ts.Symbol): boolean =>
  ts.displayPartsToString(s.getDocumentationComment(checker)).trim() !== ''
const experimental = (s: ts.Symbol): boolean =>
  (s.declarations ?? []).some((d) =>
    ts.getJSDocTags(d).some((t) => t.tagName.text === 'experimental'),
  )

/** The names each examples/ file imports from `specifier`. */
function imported(specifier: string): Set<string> {
  const dir = join(PACKAGE_DIR, 'examples')
  const names = new Set<string>()
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const sf = ts.createSourceFile(
      file,
      readFileSync(join(dir, file), 'utf8'),
      ts.ScriptTarget.Latest,
    )
    for (const statement of sf.statements) {
      if (!ts.isImportDeclaration(statement)) continue
      if ((statement.moduleSpecifier as ts.StringLiteral).text !== specifier) continue
      const named = statement.importClause?.namedBindings
      if (named !== undefined && ts.isNamedImports(named))
        for (const element of named.elements) names.add(element.name.text)
    }
  }
  return names
}

describe.each(Object.entries(ENTRIES))('%s', (specifier, file) => {
  const exports = exportsOf(file)

  test('every export, and every field of every exported interface, has TSDoc', () => {
    expect([...exports].filter(([, s]) => !documented(s)).map(([name]) => name)).toEqual([])
    const bare: string[] = []
    for (const [name, s] of exports) {
      if (!(s.flags & ts.SymbolFlags.Interface)) continue
      for (const f of checker.getDeclaredTypeOfSymbol(s).getProperties())
        if (!documented(f)) bare.push(`${name}.${f.name}`)
    }
    expect(bare).toEqual([])
  })

  test('the README lists its experimental exports as the @experimental tags have them', () => {
    const start = README.indexOf(`The experimental exports of \`${specifier}\`:`)
    expect(start).toBeGreaterThan(-1)
    const list = README.slice(start).split('\n\n')[1] ?? ''
    const listed = [...list.matchAll(/`([A-Za-z_$][\w$]*)`/g)].map((m) => m[1])
    const tagged = [...exports].filter(([, s]) => experimental(s)).map(([name]) => name)
    expect(listed.sort()).toEqual(tagged.sort())
    // The package is new: nothing is stable yet.
    expect(tagged.sort()).toEqual([...exports.keys()].sort())
  })

  test('examples/ uses every export, through the package name', () => {
    const used = imported(specifier)
    expect([...exports.keys()].filter((name) => !used.has(name))).toEqual([])
  })
})

test('the main entry loads no node: module and no code of another package', () => {
  const seen = new Set<string>()
  const runtime: string[] = []
  const visit = (file: string): void => {
    if (seen.has(file)) return
    seen.add(file)
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest)
    for (const statement of sf.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue
      if (statement.moduleSpecifier === undefined) continue
      const typeOnly = ts.isImportDeclaration(statement)
        ? statement.importClause?.isTypeOnly === true
        : statement.isTypeOnly
      const from = (statement.moduleSpecifier as ts.StringLiteral).text
      if (from.startsWith('.')) visit(join(file, '..', from))
      else if (!typeOnly) runtime.push(`${file}: ${from}`)
    }
  }
  visit(join(PACKAGE_DIR, 'src', 'index.ts'))
  expect(runtime).toEqual([])
  expect(seen.size).toBeGreaterThan(5)
  // The REST handler is web-standard too, but for the generated version it has no part in.
  seen.clear()
  visit(join(PACKAGE_DIR, 'src', 'rest.ts'))
  expect(runtime).toEqual([])
})
