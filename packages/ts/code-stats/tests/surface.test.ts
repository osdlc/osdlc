/**
 * Checks on the public surface as a whole. The four entry points are the
 * `exports` of package.json, and for each one:
 * - every export has a documentation comment,
 * - every value export is used by a file in examples/,
 * - the README's experimental list equals the `@experimental` tags.
 * The checks after them hold the layering the README promises.
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'
import { describe, expect, test } from 'vitest'

import * as pkg from '@osdlc/code-stats'
import * as prep from '@osdlc/code-stats/prep'
import * as scan from '@osdlc/code-stats/scan'
import * as treeSitter from '@osdlc/code-stats/tree-sitter'

const PACKAGE_DIR = join(import.meta.dirname, '..')
const PACKAGE_NAME = (
  JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf-8')) as { name: string }
).name

/** One entry point: its source file and the specifier consumers import. */
const ENTRIES = [
  { specifier: PACKAGE_NAME, entry: 'src/index.ts' },
  { specifier: `${PACKAGE_NAME}/scan`, entry: 'src/scan/index.ts' },
  { specifier: `${PACKAGE_NAME}/prep`, entry: 'src/prep/index.ts' },
  { specifier: `${PACKAGE_NAME}/tree-sitter`, entry: 'src/tree-sitter/index.ts' },
]

test('every entry is in package.json exports', () => {
  const manifest = JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf-8')) as {
    exports: Record<string, unknown>
  }
  const declared = Object.keys(manifest.exports).map((key) =>
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

/** One export of an entry point, read from the compiler. */
interface Item {
  name: string
  /** Tagged `@experimental`. */
  experimental: boolean
  /** Has a documentation comment. */
  documented: boolean
  /** Exists at run time, not only as a type. */
  isValue: boolean
}

function itemsOf(entryFile: string): Item[] {
  const program = ts.createProgram([entryFile], COMPILER_OPTIONS)
  const checker = program.getTypeChecker()
  const module = checker.getSymbolAtLocation(program.getSourceFile(entryFile)!)!
  return checker.getExportsOfModule(module).map((exported) => {
    const symbol =
      exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
    return {
      name: exported.name,
      experimental: (symbol.declarations ?? []).some((d) =>
        ts.getJSDocTags(d).some((t) => t.tagName.text === 'experimental'),
      ),
      documented: ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim() !== '',
      isValue: (symbol.flags & ts.SymbolFlags.Value) !== 0,
    }
  })
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
  // `@osdlc/command-seam` supplies the command runners `runPrep` takes, and `typescript` the
  // compiler module the complexity analyzer takes.
  const allowed = new Set<string>([
    ...ENTRIES.map((e) => e.specifier),
    'vitest',
    '@osdlc/command-seam',
    'typescript',
  ])
  const stray = [...IMPORTED.keys()].filter((s) => !allowed.has(s) && !s.startsWith('node:'))
  expect(stray).toEqual([])
})

const README = readFileSync(join(PACKAGE_DIR, 'README.md'), 'utf-8')

for (const { specifier, entry } of ENTRIES) {
  describe(specifier, () => {
    const items = itemsOf(join(PACKAGE_DIR, entry))

    test('the entry point exports something', () => {
      expect(items.length).toBeGreaterThan(0)
    })

    test('every export has a documentation comment', () => {
      expect(items.filter((i) => !i.documented).map((i) => i.name)).toEqual([])
    })

    test('every value export is used by examples/', () => {
      const imported = IMPORTED.get(specifier) ?? new Set<string>()
      expect(items.filter((i) => i.isValue && !imported.has(i.name)).map((i) => i.name)).toEqual([])
    })

    test('the README experimental list matches the @experimental tags', () => {
      const tagged = items.filter((i) => i.experimental).map((i) => i.name)
      const marker = `The experimental exports of \`${specifier}\`:`
      const start = README.indexOf(marker)
      if (tagged.length === 0) {
        expect(start).toBe(-1)
        return
      }
      expect(start).toBeGreaterThan(-1)
      const list = README.slice(start).split('\n\n')[1] ?? ''
      const listed = [...list.matchAll(/`([A-Za-z_$][\w$]*)`/g)].map((m) => m[1]!)

      expect(listed.filter((name) => !items.some((i) => i.name === name))).toEqual([])
      expect([...listed].sort()).toEqual([...tagged].sort())
    })
  })
}

test('the main entry exports exactly this surface', () => {
  expect(Object.keys(pkg).sort()).toMatchInlineSnapshot(`
    [
      "CHANGE_CATEGORIES",
      "CHANGE_KINDS",
      "CodeStatsError",
      "DEFAULT_RULES",
      "DIFF_FLAGS",
      "ENTRY_KINDS",
      "FILE_GROUPS",
      "FILE_STATUSES",
      "OPERATIONS",
      "PACKAGES_SECTION",
      "RISK_SECTION",
      "RULE_GROUPS",
      "STATS_SECTION",
      "assignOperations",
      "buildCountReport",
      "buildDiffReport",
      "buildPackageMap",
      "categorizeChange",
      "changeSpecFrom",
      "compareChanges",
      "compareReportSchema",
      "countDirectory",
      "countReportSchema",
      "countTree",
      "createGroupClassifier",
      "createLizardAnalyzer",
      "createTypescriptAnalyzer",
      "defaultAnalyzers",
      "dependencyChange",
      "describeChange",
      "diffChange",
      "diffReportSchema",
      "measureChange",
      "openRepo",
      "parseChangeSpec",
      "parseDiff",
      "readDiff",
      "renderCompare",
      "renderCount",
      "renderDescription",
      "renderDiff",
      "renderPackageMap",
      "renderRisk",
      "riskSignals",
      "spliceDescription",
      "spliceSection",
      "writeDescription",
      "writePrBody",
    ]
  `)
})

test('the scan entry exports exactly this surface', () => {
  expect(Object.keys(scan).sort()).toMatchInlineSnapshot(`
    [
      "CONTENT_KINDS",
      "addKindCounts",
      "classifyLines",
      "countKinds",
      "createScannerRegistry",
      "detectLanguage",
      "emptyKindCounts",
      "knownLanguages",
      "languageNamed",
      "prefixKind",
      "splitLines",
      "stripBom",
    ]
  `)
})

test('the prep entry exports exactly this surface', () => {
  expect(Object.keys(prep).sort()).toMatchInlineSnapshot(`
    [
      "DEFAULT_THRESHOLDS",
      "PACKAGE_MARKERS",
      "buildGroups",
      "nearestRoot",
      "packageRoots",
      "prepManifestSchema",
      "runPrep",
    ]
  `)
})

test('the tree-sitter entry exports exactly this surface', () => {
  expect(Object.keys(treeSitter).sort()).toMatchInlineSnapshot(`
    [
      "BUILTIN_GRAMMARS",
      "createTreeSitterScanners",
      "treeSitterScanner",
    ]
  `)
})

test('the file-system reader never runs git: src/files imports no git module, command seam or measure', () => {
  const dir = fileURLToPath(new URL('../src/files/', import.meta.url))
  for (const file of readdirSync(dir)) {
    const source = readFileSync(`${dir}${file}`, 'utf8')
    for (const [statement, spec] of source.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)) {
      expect(spec, `${file} imports ${spec}`).not.toMatch(/^\.\.\/git\/|command-seam|measure/)
      // typed-git only for `checkoutRoot`, which reads the filesystem; the next test holds it to that.
      if (spec === '@osdlc/typed-git') {
        expect(statement, `${file} imports more than checkoutRoot`).toMatch(
          /^import \{ checkoutRoot \} from/,
        )
      }
    }
  }
})

test('importing typed-git and calling checkoutRoot starts no process', () => {
  // A folder with a `.git` entry is a checkout to checkoutRoot, whatever is inside it.
  const checkout = realpathSync(mkdtempSync(join(tmpdir(), 'code-stats-checkout-')))
  try {
    mkdirSync(join(checkout, '.git'))
    const script = `
      import cp from 'node:child_process'
      import { syncBuiltinESMExports } from 'node:module'
      for (const k of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
        cp[k] = () => { throw new Error('started a process: ' + k) }
      }
      syncBuiltinESMExports()
      const { checkoutRoot } = await import('@osdlc/typed-git')
      process.stdout.write(String(checkoutRoot(${JSON.stringify(checkout)})))
    `
    const cwd = fileURLToPath(new URL('..', import.meta.url))
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd,
      encoding: 'utf8',
      timeout: 30_000,
    })
    expect(r.stderr).toBe('')
    expect(r.status).toBe(0)
    expect(r.stdout).toBe(checkout)
  } finally {
    rmSync(checkout, { recursive: true, force: true })
  }
})

test('the scanner is pure: everything under src/scan imports only from src/scan', () => {
  const dir = fileURLToPath(new URL('../src/scan/', import.meta.url))
  for (const file of readdirSync(dir)) {
    const source = readFileSync(`${dir}${file}`, 'utf8')
    for (const [, spec] of source.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)) {
      expect(spec, `${file} imports ${spec}`).toMatch(/^\.\/[^/]+\.ts$/)
    }
  }
})
