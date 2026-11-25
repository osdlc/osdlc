/**
 * Checks on the public surface as a whole: every export has a documentation
 * comment, every value export is used in examples/, `package.json` `exports`
 * lists exactly the entry points tested here, and the README's experimental
 * lists match the `@experimental` tags, for exports and for members.
 *
 * A component is exported from a `.vue` file, which the TypeScript program
 * here cannot read. Its documentation comment and tag are on its `export` line
 * in src/index.ts, and this test reads them from there.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import ts from 'typescript'
import { describe, expect, test } from 'vitest'

const PACKAGE_DIR = join(import.meta.dirname, '..')
const PACKAGE_NAME = (
  JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf-8')) as { name: string }
).name
const STYLESHEET = `${PACKAGE_NAME}/style.css`

/** The one entry point with TypeScript to read: its source file and the specifier consumers import. */
const ENTRY = { specifier: PACKAGE_NAME, entry: 'src/index.ts' }

test('every entry is in package.json exports', () => {
  const pkg = JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf-8')) as {
    exports: Record<string, unknown>
  }
  const declared = Object.keys(pkg.exports).map((key) =>
    key === '.' ? PACKAGE_NAME : `${PACKAGE_NAME}/${key.slice(2)}`,
  )
  // The stylesheet is the only entry that is not JavaScript.
  expect(declared.sort()).toEqual([ENTRY.specifier, STYLESHEET].sort())
})

const COMPILER_OPTIONS: ts.CompilerOptions = {
  allowImportingTsExtensions: true,
  noEmit: true,
  types: [],
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  module: ts.ModuleKind.ESNext,
}

const hasExperimentalTag = (declarations: readonly ts.Declaration[] | undefined): boolean =>
  (declarations ?? []).some((d) =>
    ts.getJSDocTags(d).some((t) => t.tagName.text === 'experimental'),
  )

interface ExportInfo {
  /** Tagged `@experimental`. */
  experimental: boolean
  /** A value (function, class, constant, component), not only a type. */
  isValue: boolean
  /** Documentation text, empty when there is none. */
  doc: string
  /** `Name.member` names of the experimental members. */
  experimentalMembers: string[]
}

/** The documentation comment before a statement, without its `*` margin. */
function leadingDoc(source: string, node: ts.Node): string {
  const ranges = ts.getLeadingCommentRanges(source, node.getFullStart()) ?? []
  const doc = ranges.map((r) => source.slice(r.pos, r.end)).filter((c) => c.startsWith('/**'))
  return doc
    .map((c) =>
      c
        .replace(/^\/\*\*|\*\/$/g, '')
        .split('\n')
        .map((line) => line.replace(/^\s*\*\s?/, ''))
        .join('\n')
        .trim(),
    )
    .join('\n')
}

/** The components: names exported from a `.vue` file, with the comment on their `export` line. */
function readComponents(entryFile: string): Map<string, ExportInfo> {
  const source = readFileSync(entryFile, 'utf-8')
  const sf = ts.createSourceFile(entryFile, source, ts.ScriptTarget.Latest, true)
  const out = new Map<string, ExportInfo>()
  for (const statement of sf.statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      !statement.moduleSpecifier ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.moduleSpecifier.text.endsWith('.vue') ||
      !statement.exportClause ||
      !ts.isNamedExports(statement.exportClause)
    ) {
      continue
    }
    const doc = leadingDoc(source, statement)
    for (const element of statement.exportClause.elements) {
      out.set(element.name.text, {
        experimental: /^@experimental\b/m.test(doc),
        isValue: true,
        doc,
        experimentalMembers: [],
      })
    }
  }
  return out
}

/** Every export of an entry point. */
function readExports(entryFile: string): Map<string, ExportInfo> {
  const program = ts.createProgram([entryFile], COMPILER_OPTIONS)
  const checker = program.getTypeChecker()
  const module = checker.getSymbolAtLocation(program.getSourceFile(entryFile)!)!
  const components = readComponents(entryFile)
  const out = new Map<string, ExportInfo>()
  for (const exported of checker.getExportsOfModule(module)) {
    const component = components.get(exported.name)
    if (component) {
      out.set(exported.name, component)
      continue
    }
    const symbol =
      exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
    const members: string[] = []
    for (const [name, member] of symbol.members ?? []) {
      if (hasExperimentalTag(member.declarations)) members.push(`${exported.name}.${String(name)}`)
    }
    out.set(exported.name, {
      experimental: hasExperimentalTag(symbol.declarations),
      isValue: (symbol.flags & ts.SymbolFlags.Value) !== 0,
      doc: ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim(),
      experimentalMembers: members,
    })
  }
  return out
}

/** Every module specifier a source file imports, with the names it takes. */
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

test('examples/ imports the package name, vue and vitest only', () => {
  const allowed = new Set<string>([ENTRY.specifier, 'vitest', 'vue', '@vue/test-utils'])
  const stray = [...IMPORTED.keys()].filter((s) => !allowed.has(s) && !s.startsWith('node:'))
  expect(stray).toEqual([])
})

const README = readFileSync(join(PACKAGE_DIR, 'README.md'), 'utf-8')

/** The names in backticks in the list that follows `marker`, or null when the marker is absent. */
function listedAfter(marker: string): string[] | null {
  const start = README.indexOf(marker)
  if (start === -1) return null
  const list = README.slice(start).split('\n\n')[1] ?? ''
  return [...list.matchAll(/`([A-Za-z_$][\w$.]*)`/g)].map((m) => m[1]!)
}

describe(ENTRY.specifier, () => {
  const exports = readExports(join(PACKAGE_DIR, ENTRY.entry))

  test('the entry point exports something', () => {
    expect(exports.size).toBeGreaterThan(0)
  })

  test('the components are read from src/index.ts', () => {
    expect(
      [...exports].filter(([, info]) => info.isValue && info.doc !== '').map(([n]) => n),
    ).toEqual(expect.arrayContaining(['JsonCanvas', 'CanvasNode', 'EditPanel']))
  })

  test('every export has a documentation comment', () => {
    expect([...exports].filter(([, info]) => info.doc === '').map(([name]) => name)).toEqual([])
  })

  test('every value export is used by examples/', () => {
    const imported = IMPORTED.get(ENTRY.specifier) ?? new Set<string>()
    expect(
      [...exports]
        .filter(([name, info]) => info.isValue && !imported.has(name))
        .map(([name]) => name),
    ).toEqual([])
  })

  test('the README experimental list matches the @experimental tags', () => {
    const tagged = [...exports].filter(([, info]) => info.experimental).map(([name]) => name)
    const listed = listedAfter(`The experimental exports of \`${ENTRY.specifier}\`:`)
    if (tagged.length === 0) {
      expect(listed).toBeNull()
      return
    }
    expect(listed).not.toBeNull()
    expect([...listed!].sort()).toEqual([...tagged].sort())
  })

  test('the README experimental members list matches the @experimental tags', () => {
    const tagged = [...exports.values()].flatMap((info) => info.experimentalMembers)
    const listed = listedAfter(`The experimental members of \`${ENTRY.specifier}\`:`)
    if (tagged.length === 0) {
      expect(listed).toBeNull()
      return
    }
    expect(listed).not.toBeNull()
    expect([...listed!].sort()).toEqual([...tagged].sort())
  })
})

describe(STYLESHEET, () => {
  const css = readFileSync(join(PACKAGE_DIR, 'src/index.css'), 'utf-8')

  test('the README tells the host to import it', () => {
    expect(README).toContain(`import '${STYLESHEET}'`)
  })

  test('every theming variable the README lists is declared by the stylesheet', () => {
    const section = README.slice(
      README.indexOf('## Theming'),
      README.indexOf('## ', README.indexOf('## Theming') + 5),
    )
    const listed = [...section.matchAll(/`(--vjc-[\w-]+)`/g)].map((m) => m[1]!)
    expect(listed.length).toBeGreaterThan(0)
    const undeclared = listed.filter((name) => !new RegExp(`${name}\\s*:`).test(css))
    expect(undeclared).toEqual([])
  })
})
