/**
 * Checks on the public surface as a whole: every export is used in examples/, is
 * documented, and has the stability tier the README lists; the functions that can throw
 * say so; the README's code blocks come from examples/; the manifest ships built files
 * only; and the shipped files stay independent of any host project.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import ts from 'typescript'
import { describe, expect, test } from 'vitest'

const PACKAGE_DIR = join(import.meta.dirname, '..')
const README = readFileSync(join(PACKAGE_DIR, 'README.md'), 'utf-8')
const CHANGELOG = readFileSync(join(PACKAGE_DIR, 'CHANGELOG.md'), 'utf-8')
const MANIFEST = JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf-8')) as {
  name: string
  exports: Record<string, Record<string, string>>
  bin: Record<string, string>
  files: string[]
  [field: string]: unknown
}
const PACKAGE_NAME = MANIFEST.name

/** Each public entry: its import specifier and its source file. */
const ENTRIES: Record<string, string> = {
  [PACKAGE_NAME]: 'src/index.ts',
  [`${PACKAGE_NAME}/core`]: 'src/core/index.ts',
  [`${PACKAGE_NAME}/declarative`]: 'src/declarative/index.ts',
  [`${PACKAGE_NAME}/cli`]: 'src/cli/index.ts',
}

interface ExportInfo {
  experimental: boolean
  documented: boolean
  throws: boolean
}

const program = ts.createProgram(
  Object.values(ENTRIES).map((f) => join(PACKAGE_DIR, f)),
  {
    allowImportingTsExtensions: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    types: [],
  },
)
const checker = program.getTypeChecker()

/** Every export of one entry, with its tier, its doc and whether it carries `@throws`. */
function exportInfo(file: string): Map<string, ExportInfo> {
  const module = checker.getSymbolAtLocation(program.getSourceFile(join(PACKAGE_DIR, file))!)!
  const out = new Map<string, ExportInfo>()
  for (const exported of checker.getExportsOfModule(module)) {
    const symbol =
      exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
    const tags = (symbol.declarations ?? []).flatMap((d) => ts.getJSDocTags(d))
    out.set(exported.name, {
      experimental: tags.some((t) => t.tagName.text === 'experimental'),
      documented: ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim() !== '',
      throws: tags.some((t) => t.tagName.text === 'throws'),
    })
  }
  return out
}

const BY_ENTRY = new Map(Object.entries(ENTRIES).map(([spec, file]) => [spec, exportInfo(file)]))
/** Every export name across the entries, with its info. */
const EXPORTS = new Map([...BY_ENTRY.values()].flatMap((m) => [...m]))

/** Whitespace, line comments and trailing commas removed, so reflowed code compares equal. */
function squash(code: string): string {
  return code
    .replace(/\/\/.*$/gm, '')
    .replace(/\s+/g, '')
    .replace(/,([)\]}])/g, '$1')
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|mjs)$/.test(entry.name) ? [path] : []
  })
}

const EXAMPLE_FILES = readdirSync(join(PACKAGE_DIR, 'examples'))
  .filter((f) => f.endsWith('.ts'))
  .map((f) => join(PACKAGE_DIR, 'examples', f))

test('the entries export the names this test lists', () => {
  const sizes = Object.fromEntries([...BY_ENTRY].map(([spec, m]) => [spec, m.size]))
  expect(sizes).toEqual({
    [PACKAGE_NAME]: 86,
    [`${PACKAGE_NAME}/core`]: 82,
    [`${PACKAGE_NAME}/declarative`]: 11,
    [`${PACKAGE_NAME}/cli`]: 2,
  })
})

test('the root adds only the folder runner to ./core', () => {
  const root = [...BY_ENTRY.get(PACKAGE_NAME)!.keys()]
  const core = new Set(BY_ENTRY.get(`${PACKAGE_NAME}/core`)!.keys())
  expect(root.filter((name) => !core.has(name)).sort()).toEqual(
    ['CorpusConfig', 'RunStats', 'defineConfig', 'runCorpus'].sort(),
  )
})

test('every export is used by examples/, which imports the package entries only', () => {
  const imported = new Set<string>()
  const specifiers = new Set<string>()
  for (const file of EXAMPLE_FILES) {
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf-8'), ts.ScriptTarget.Latest)
    for (const statement of sf.statements) {
      if (!ts.isImportDeclaration(statement)) continue
      const specifier = (statement.moduleSpecifier as ts.StringLiteral).text
      specifiers.add(specifier)
      const named = statement.importClause?.namedBindings
      if (!(specifier in ENTRIES) || !named || !ts.isNamedImports(named)) continue
      for (const element of named.elements)
        imported.add((element.propertyName ?? element.name).text)
    }
  }
  const allowed = new Set([
    ...Object.keys(ENTRIES),
    'vitest',
    'zod',
    'node:fs',
    'node:os',
    'node:path',
  ])
  expect([...specifiers].filter((s) => !allowed.has(s))).toEqual([])
  expect([...EXPORTS.keys()].filter((name) => !imported.has(name))).toEqual([])
})

test('every export has TSDoc', () => {
  expect([...EXPORTS].filter(([, info]) => !info.documented).map(([name]) => name)).toEqual([])
})

test('the README experimental list matches the @experimental tags', () => {
  const start = README.indexOf('The experimental exports:')
  expect(start).toBeGreaterThan(-1)
  const list = README.slice(start).split('\n\n')[1] ?? ''
  const listed = [...list.matchAll(/`([A-Za-z_$][\w$]*)`/g)].map((m) => m[1]!)
  const tagged = [...EXPORTS].filter(([, info]) => info.experimental).map(([name]) => name)

  expect(listed.filter((name) => !EXPORTS.has(name))).toEqual([])
  expect([...listed].sort()).toEqual([...tagged].sort())
  expect([...tagged].sort()).toEqual(
    [
      'CliResult',
      'InferOptions',
      'InferResult',
      'InferredContract',
      'InferredFile',
      'TextEdit',
      'inferConfig',
      'runCli',
    ].sort(),
  )
})

test('the functions that can throw say so with @throws, and no others do', () => {
  const throwing = [...EXPORTS].filter(([, info]) => info.throws).map(([name]) => name)
  expect(throwing.sort()).toEqual(
    [
      'compileContractObject',
      'inferConfig',
      'loadConfig',
      'loadConfigFile',
      'loadContract',
      'loadContractFile',
      'lenientBody',
      'oneOf',
      'optionalSection',
      'requires',
      'parse',
      'runCorpus',
      'section',
      'sections',
      'strictBody',
      'textRule',
    ].sort(),
  )
})

test('the README names every export', () => {
  // A code span that starts with the name, such as `parse(source)`, names it.
  const named = new Set([...README.matchAll(/`([A-Za-z_$][\w$]*)/g)].map((m) => m[1]!))
  expect([...EXPORTS.keys()].filter((name) => !named.has(name))).toEqual([])
})

test('every README ts block, minus its imports, appears in examples/', () => {
  const blocks = [...README.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1]!)
  expect(blocks.length).toBeGreaterThan(0)
  const examples = squash(EXAMPLE_FILES.map((f) => readFileSync(f, 'utf-8')).join('\n'))
  for (const block of blocks) {
    const sf = ts.createSourceFile('block.ts', block, ts.ScriptTarget.Latest)
    const body = sf.statements
      .filter((s) => !ts.isImportDeclaration(s))
      .map((s) => s.getFullText(sf))
      .join('\n')
    expect(body.trim()).not.toBe('')
    expect(examples).toContain(squash(body))
  }
})

test('the README imports the package by its published name', () => {
  const blocks = [...README.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1]!).join('\n')
  expect(blocks).toMatch(new RegExp(`from ["']${PACKAGE_NAME}["']`))
})

describe('the manifest', () => {
  test('every entry points at built JavaScript and declarations, with no source condition', () => {
    expect(Object.keys(MANIFEST.exports).sort()).toEqual(['.', './cli', './core', './declarative'])
    for (const conditions of Object.values(MANIFEST.exports)) {
      expect(Object.keys(conditions)).toEqual(['types', 'default'])
      expect(conditions.types).toMatch(/^\.\/dist\/.*\.d\.ts$/)
      expect(conditions.default).toMatch(/^\.\/dist\/.*\.js$/)
    }
    expect(MANIFEST.bin).toEqual({ 'markdown-contract': './dist/cli/bin.js' })
  })

  test('zod is a peer, not a dependency', () => {
    expect(MANIFEST.peerDependencies).toEqual({ zod: '^4' })
    expect(MANIFEST.dependencies).not.toHaveProperty('zod')
  })

  test('the published files are dist/ and the docs', () => {
    expect(MANIFEST.files.filter((f) => /\.ts$|^src/.test(f))).toEqual([])
  })
})

describe('independence from any host project', () => {
  // Built from parts so this file does not match its own check.
  const HOST_TERMS = new RegExp(
    [
      '\\bsd' + 'lc\\b', // the scope `@osdlc` is not the tool
      'tool-' + 'router',
      'cata' + 'logue',
      'docs/' + 'planning',
      'sks' + 'izer/',
      'mono' + 'repo',
      '\\bdog' + 'food',
      '\\bbi' + 'ome\\b',
      '\\bb' + 'un\\b',
      '\\bmo' + 'on\\b',
      '\\b[TDBSMNC]-[0-9A-Z]{4}\\b',
    ].join('|'),
    'i',
  )
  const OWNER = new RegExp('@' + 'sksizer|sks' + 'izer/')

  const shipped = [
    ...sourceFiles(join(PACKAGE_DIR, 'src')).filter((f) => !f.endsWith('.test.ts')),
    join(PACKAGE_DIR, 'README.md'),
    join(PACKAGE_DIR, 'CHANGELOG.md'),
  ]
  // Test data keeps realistic document ids and paths, so the tests get the narrower check.
  const unshipped = [
    ...sourceFiles(join(PACKAGE_DIR, 'src')).filter((f) => f.endsWith('.test.ts')),
    ...sourceFiles(join(PACKAGE_DIR, 'tests')),
    ...EXAMPLE_FILES,
  ].filter((f) => !f.endsWith('exports.test.ts'))

  test('no shipped file names a host project, tool or note', () => {
    for (const file of shipped) {
      const text = readFileSync(file, 'utf-8')
      expect([file, text.match(HOST_TERMS)?.[0]]).toEqual([file, undefined])
    }
  })

  test('no file names the owner, and the tests import only this package', () => {
    for (const file of [...shipped, ...unshipped]) {
      const text = readFileSync(file, 'utf-8')
      expect([file, text.match(OWNER)?.[0]]).toEqual([file, undefined])
    }
    for (const file of unshipped) {
      const text = readFileSync(file, 'utf-8')
      const others = [...text.matchAll(/@osdlc\/[\w-]+(\/[\w-]+)?/g)].map((m) => m[0])
      for (const spec of others) expect(Object.keys(ENTRIES)).toContain(spec)
    }
  })

  test('the changelog links no pull request and names no repository', () => {
    expect(CHANGELOG).not.toMatch(/#\d{2,}\b/)
    expect(CHANGELOG).not.toMatch(/github\.com/)
  })
})
