/**
 * Checks on the public API as a whole: every export and every `CorpusReport` field has TSDoc,
 * the README names every export, its experimental list matches the `@experimental` tags, and
 * examples/ uses every export through the package name.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import ts from 'typescript'
import { expect, test } from 'vitest'

const PACKAGE_DIR = join(import.meta.dirname, '..')
const ENTRY = join(PACKAGE_DIR, 'src', 'index.ts')
const README = readFileSync(join(PACKAGE_DIR, 'README.md'), 'utf8')

const program = ts.createProgram([ENTRY], {
  allowImportingTsExtensions: true,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  noEmit: true,
  types: [],
})
const checker = program.getTypeChecker()
const entry = checker.getSymbolAtLocation(program.getSourceFile(ENTRY)!)!

/** Each export of the entry point, by name, as the symbol it stands for. */
const EXPORTS = new Map(
  checker
    .getExportsOfModule(entry)
    .map((s) => [s.name, s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s]),
)

const documented = (s: ts.Symbol): boolean =>
  ts.displayPartsToString(s.getDocumentationComment(checker)).trim() !== ''
const experimental = (s: ts.Symbol): boolean =>
  (s.declarations ?? []).some((d) =>
    ts.getJSDocTags(d).some((t) => t.tagName.text === 'experimental'),
  )

test('the entry point exports these names', () => {
  expect([...EXPORTS.keys()].sort()).toEqual(
    [
      'CorpusReport',
      'Data',
      'encodePath',
      'findCorpora',
      'fold',
      'idProblem',
      'markdownLink',
      'npmPackageUrl',
      'packageUrl',
      'PackageUrl',
      'SyncReport',
      'syncCorpus',
      'validateCorpus',
    ].sort(),
  )
})

test('every export, and every CorpusReport field, has TSDoc', () => {
  expect([...EXPORTS].filter(([, s]) => !documented(s)).map(([name]) => name)).toEqual([])
  const report = EXPORTS.get('CorpusReport')!
  const fields = checker.getDeclaredTypeOfSymbol(report).getProperties()
  expect(fields.length).toBeGreaterThan(0)
  expect(fields.filter((f) => !documented(f)).map((f) => f.name)).toEqual([])
})

test('the README names every export', () => {
  // A code span that starts with the name, such as `fold(s)`, names it.
  const named = new Set([...README.matchAll(/`([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))
  expect([...EXPORTS.keys()].filter((name) => !named.has(name))).toEqual([])
})

test('the README experimental list matches the @experimental tags', () => {
  const start = README.indexOf('The experimental exports')
  expect(start).toBeGreaterThan(-1)
  const list = README.slice(start).split('\n\n')[1] ?? ''
  const listed = [...list.matchAll(/`([A-Za-z_$][\w$]*)`/g)].map((m) => m[1])
  const tagged = [...EXPORTS].filter(([, s]) => experimental(s)).map(([name]) => name)
  expect(listed.sort()).toEqual(tagged.sort())
  if (tagged.length === 0) expect(list.trim()).toBe('- none')
})

test('every export is used by examples/, which imports the package by name', () => {
  const dir = join(PACKAGE_DIR, 'examples')
  const imported = new Set<string>()
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const sf = ts.createSourceFile(
      file,
      readFileSync(join(dir, file), 'utf8'),
      ts.ScriptTarget.Latest,
    )
    for (const statement of sf.statements) {
      if (!ts.isImportDeclaration(statement)) continue
      if ((statement.moduleSpecifier as ts.StringLiteral).text !== '@osdlc/corpus-schema') continue
      const named = statement.importClause?.namedBindings
      if (named !== undefined && ts.isNamedImports(named))
        for (const element of named.elements) imported.add(element.name.text)
    }
  }
  expect([...EXPORTS.keys()].filter((name) => !imported.has(name))).toEqual([])
})
