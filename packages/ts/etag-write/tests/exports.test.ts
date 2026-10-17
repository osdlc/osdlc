/**
 * Checks on the public surface as a whole: every export is used in
 * examples/, the README's experimental list matches the `@experimental`
 * tags, and the README's code blocks run.
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from 'bun:test'
import ts from 'typescript'

const PACKAGE_DIR = join(import.meta.dir, '..')
const ENTRY = join(PACKAGE_DIR, 'index.ts')
const README = readFileSync(join(PACKAGE_DIR, 'README.md'), 'utf-8')
const PACKAGE_NAME = (
  JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf-8')) as { name: string }
).name

/** Every export of the entry point, mapped to whether it is tagged `@experimental`. */
function taggedExports(): Map<string, boolean> {
  const program = ts.createProgram([ENTRY], {
    allowImportingTsExtensions: true,
    noEmit: true,
    types: [],
  })
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

const EXPORTS = taggedExports()

test('the entry point exports something', () => {
  expect(EXPORTS.size).toBeGreaterThan(0)
})

test('every export is used by examples/, which imports the package name only', () => {
  const dir = join(PACKAGE_DIR, 'examples')
  const sources = readdirSync(dir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => readFileSync(join(dir, f), 'utf-8'))
  const imported = new Set<string>()
  const specifiers = new Set<string>()
  for (const source of sources) {
    for (const m of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
      specifiers.add(m[2]!)
      if (m[2] !== PACKAGE_NAME) continue
      for (const name of m[1]!.split(',')) {
        const clean = name.trim().replace(/^type\s+/, '')
        if (clean) imported.add(clean)
      }
    }
  }
  expect(
    [...specifiers].filter((s) => s !== PACKAGE_NAME && s !== 'bun:test' && !s.startsWith('node:')),
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

test('the README names every export', () => {
  // A code span that starts with the name, such as `etag(data)`, names it.
  const named = new Set([...README.matchAll(/`([A-Za-z_$][\w$]*)/g)].map((m) => m[1]!))
  expect([...EXPORTS.keys()].filter((name) => !named.has(name))).toEqual([])
})

test('every README ts block runs against the package', async () => {
  const blocks = [...README.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1]!)
  expect(blocks.length).toBeGreaterThan(0)
  // Inside the package, so the package name resolves as it does for examples/.
  const dir = mkdtempSync(join(PACKAGE_DIR, '.readme-'))
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
