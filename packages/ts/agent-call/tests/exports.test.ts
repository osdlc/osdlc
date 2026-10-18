/**
 * Checks on the public surface as a whole: every export is used in
 * examples/, is documented, and has the stability tier the README lists; the
 * functions that can throw say so; the README's code blocks come from
 * examples/; and the shipped files stay independent of any host project.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'
import ts from 'typescript'

import * as api from '../src/index.js'

const PACKAGE_DIR = join(import.meta.dirname, '..')
const ENTRY = join(PACKAGE_DIR, 'src', 'index.ts')
const README = readFileSync(join(PACKAGE_DIR, 'README.md'), 'utf-8')
const CHANGELOG = readFileSync(join(PACKAGE_DIR, 'CHANGELOG.md'), 'utf-8')
const MANIFEST: { name: string; [field: string]: unknown } = JSON.parse(
  readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf-8'),
)
const PACKAGE_NAME = MANIFEST.name

interface ExportInfo {
  experimental: boolean
  documented: boolean
  throws: boolean
}

/** Every export of the entry point, with its tier, its doc and whether it carries `@throws`. */
function exportInfo(): Map<string, ExportInfo> {
  const program = ts.createProgram([ENTRY], {
    allowImportingTsExtensions: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    types: [],
  })
  const checker = program.getTypeChecker()
  const module = checker.getSymbolAtLocation(program.getSourceFile(ENTRY)!)!
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

const EXPORTS = exportInfo()

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
    return entry.name.endsWith('.ts') ? [path] : []
  })
}

test('the entry point exports 55 names', () => {
  expect(EXPORTS.size).toBe(55)
})

test('the runtime exports are the functions and constants, no more', () => {
  expect(Object.keys(api).sort()).toEqual(
    [
      'adapterFor',
      'antigravityAdapter',
      'assistantText',
      'BUILTIN_AGENTS',
      'callAgent',
      'claudeAdapter',
      'claudePluginArgv',
      'claudeResumeFlag',
      'codexAdapter',
      'CONVERSATION_SCHEMA',
      'customAdapter',
      'detectAgents',
      'EFFORT_LEVELS',
      'modelArgs',
      'modelArgsRefusal',
      'opencodeAdapter',
      'planCall',
      'templateAdapter',
      'templateRefusal',
      'TMP_TOKEN',
      'toolCalls',
    ].sort(),
  )
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
    [...specifiers].filter(
      (s) => s !== PACKAGE_NAME && s !== `${PACKAGE_NAME}/models` && s !== 'vitest',
    ),
  ).toEqual([])
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
      'ModelChoice',
      'TemplateAdapterOptions',
      'claudePluginArgv',
      'claudeResumeFlag',
      'modelArgs',
      'modelArgsRefusal',
      'templateAdapter',
      'templateRefusal',
    ].sort(),
  )
})

test('the functions that can throw say so with @throws, and no others do', () => {
  const throwing = [...EXPORTS].filter(([, info]) => info.throws).map(([name]) => name)
  expect(throwing.sort()).toEqual(['callAgent', 'modelArgs', 'planCall', 'templateAdapter'].sort())
})

test('the README names every export', () => {
  // A code span that starts with the name, such as `parseColor(css)`, names it.
  const named = new Set([...README.matchAll(/`([A-Za-z_$][\w$]*)/g)].map((m) => m[1]!))
  expect([...EXPORTS.keys()].filter((name) => !named.has(name))).toEqual([])
})

test('every README ts block, minus its imports, appears in examples/', () => {
  const blocks = [...README.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1]!)
  expect(blocks.length).toBeGreaterThan(0)
  const examples = squash(
    readdirSync(join(PACKAGE_DIR, 'examples'))
      .filter((f) => f.endsWith('.ts'))
      .map((f) => readFileSync(join(PACKAGE_DIR, 'examples', f), 'utf-8'))
      .join('\n'),
  )
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
  expect(blocks).toContain("from '@osdlc/agent-call'")
})

test('the package has no dependencies', () => {
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    expect(MANIFEST[field]).toBeUndefined()
  }
})

describe('independence from any host project', () => {
  // Built from parts so this file does not match its own check.
  const HOST_TERMS = new RegExp(
    [
      '\\bsd' + 'lc\\b', // the scope `@osdlc` is not the tool
      'tool-' + 'router',
      'cata' + 'logue',
      'docs/' + 'planning',
      'mono' + 'repo',
      '\\b[TDBSMN]-[0-9A-Z]{4}\\b',
    ].join('|'),
    'i',
  )
  const OWNER_SCOPE = new RegExp('@' + 'sksizer')

  const shipped = [
    ...sourceFiles(join(PACKAGE_DIR, 'src')),
    join(PACKAGE_DIR, 'README.md'),
    join(PACKAGE_DIR, 'CHANGELOG.md'),
  ]
  const unshipped = [
    ...sourceFiles(join(PACKAGE_DIR, 'tests')),
    ...sourceFiles(join(PACKAGE_DIR, 'examples')),
  ].filter((f) => !f.endsWith('exports.test.ts'))

  test('no file names a host project, tool or note', () => {
    for (const file of [...shipped, ...unshipped]) {
      const text = readFileSync(file, 'utf-8')
      expect([file, text.match(HOST_TERMS)?.[0]]).toEqual([file, undefined])
    }
  })

  test('shipped files carry no owner scope, and the tests only import the name of this package', () => {
    for (const file of shipped) {
      const text = readFileSync(file, 'utf-8')
      expect([file, text.match(OWNER_SCOPE)?.[0]]).toEqual([file, undefined])
    }
    for (const file of unshipped) {
      const text = readFileSync(file, 'utf-8')
      const others = [...text.matchAll(new RegExp('@' + 'osdlc/[\\w-]+(/[\\w-]+)?', 'g'))].map(
        (m) => m[0],
      )
      for (const spec of others) expect([PACKAGE_NAME, `${PACKAGE_NAME}/models`]).toContain(spec)
    }
  })

  test('the changelog links no pull request and names no repository', () => {
    expect(CHANGELOG).not.toMatch(/#\d{2,}\b/)
    expect(CHANGELOG).not.toMatch(/github\.com/)
  })
})
