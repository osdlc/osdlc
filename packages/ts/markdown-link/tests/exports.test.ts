/**
 * Checks on the public surface as a whole: the export list is pinned, the
 * README names every export, its code blocks run, and the package has no
 * dependencies.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { expect, test } from 'vitest'
import ts from 'typescript'

import * as main from '../src/index.ts'

const PACKAGE_DIR = join(import.meta.dirname, '..')
// A Windows checkout may have CRLF line ends.
const README = readFileSync(join(PACKAGE_DIR, 'README.md'), 'utf-8').replaceAll('\r\n', '\n')
const MANIFEST: { [field: string]: unknown } = JSON.parse(
  readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf-8'),
)

/** The public surface. Changing it is a decision in a diff, not a side effect. */
const VALUES = [
  'ATTACHMENT_EXTENSIONS',
  'bodyLinks',
  'bodyLinksSpanned',
  'displayText',
  'isVaultLinkUrl',
  'mdLinkTarget',
  'parseInner',
  'parseTypedRef',
  'stripCode',
  'stripCodeWith',
  'targetRange',
]
const TYPES = [
  'BodyLink',
  'BodyLinkKind',
  'CodeRules',
  'LinkKind',
  'RawLink',
  'TextRange',
  'TypedRef',
  'WikiLink',
]

/** Every export of the entry point, values and types. */
function exportNames(): string[] {
  const file = join(PACKAGE_DIR, 'src', 'index.ts')
  const program = ts.createProgram([file], {
    allowImportingTsExtensions: true,
    noEmit: true,
    types: [],
  })
  const checker = program.getTypeChecker()
  const module = checker.getSymbolAtLocation(program.getSourceFile(file)!)!
  return checker.getExportsOfModule(module).map((exported) => exported.name)
}

test('exports exactly the pinned list', () => {
  expect(exportNames().sort()).toEqual([...VALUES, ...TYPES].sort())
})

test('exports the pinned values at run time', () => {
  expect(Object.keys(main).sort()).toEqual([...VALUES].sort())
})

test('the README names every value export', () => {
  // A code span that starts with the name, such as `stripCodeWith(text, rules)`, names it.
  const named = new Set([...README.matchAll(/`([A-Za-z_$][\w$]*)/g)].map((m) => m[1]!))
  expect(VALUES.filter((name) => !named.has(name))).toEqual([])
})

test('every README ts block runs against the package', async () => {
  const blocks = [...README.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1]!)
  expect(blocks.length).toBeGreaterThan(0)
  // The Vitest alias resolves the package name from any directory.
  const dir = mkdtempSync(join(tmpdir(), 'markdown-link-readme-'))
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

test('the package has no dependencies', () => {
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    expect(MANIFEST[field]).toBeUndefined()
  }
})
