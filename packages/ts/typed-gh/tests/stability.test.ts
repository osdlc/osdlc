/**
 * The README's experimental list and the `@experimental` TSDoc tags name the
 * same items: the exports of the entry point and the methods of `Gh` and
 * `AsyncGh`.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from 'vitest'
import ts from 'typescript'

const PACKAGE_DIR = join(import.meta.dirname, '..')
const ENTRY = join(PACKAGE_DIR, 'src', 'index.ts')

function isExperimental(declarations: readonly ts.Declaration[] | undefined): boolean {
  return (declarations ?? []).some((d) =>
    ts.getJSDocTags(d).some((t) => t.tagName.text === 'experimental'),
  )
}

/** Each export, and each public method of the two clients, mapped to whether it is tagged. */
function tagged(): { exports: Map<string, boolean>; methods: Map<string, boolean[]> } {
  const program = ts.createProgram([ENTRY], {
    allowImportingTsExtensions: true,
    noEmit: true,
    types: [],
  })
  const checker = program.getTypeChecker()
  const module = checker.getSymbolAtLocation(program.getSourceFile(ENTRY)!)!
  const exports = new Map<string, boolean>()
  const methods = new Map<string, boolean[]>()
  for (const exported of checker.getExportsOfModule(module)) {
    const symbol =
      exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
    exports.set(exported.name, isExperimental(symbol.declarations))
    if (exported.name !== 'Gh' && exported.name !== 'AsyncGh') continue
    for (const member of symbol.members?.values() ?? []) {
      if (!(member.flags & ts.SymbolFlags.Method)) continue
      const isPrivate = (member.declarations ?? []).some((d) =>
        ts.getCombinedModifierFlags(d) & ts.ModifierFlags.Private ? true : false,
      )
      if (isPrivate) continue
      const name = member.name
      methods.set(name, [...(methods.get(name) ?? []), isExperimental(member.declarations)])
    }
  }
  return { exports, methods }
}

/** The names in the README's "The experimental items" list. */
function readmeExperimental(): string[] {
  const readme = readFileSync(join(PACKAGE_DIR, 'README.md'), 'utf-8')
  const start = readme.indexOf('The experimental items:')
  expect(start).toBeGreaterThan(-1)
  const list = readme.slice(start).split('\n\n')[1] ?? ''
  return list
    .split('\n')
    .filter((l) => l.startsWith('- '))
    .flatMap((l) => [...l.matchAll(/`([A-Za-z_$][\w$]*)`/g)].map((m) => m[1]!))
}

test('the README experimental list matches the @experimental tags', () => {
  const { exports, methods } = tagged()
  const listed = new Set(readmeExperimental())
  const taggedNames = new Set([
    ...[...exports].filter(([, e]) => e).map(([name]) => name),
    ...[...methods].filter(([, e]) => e.some(Boolean)).map(([name]) => name),
  ])

  expect([...listed].filter((name) => !exports.has(name) && !methods.has(name))).toEqual([])
  expect([...listed].sort()).toEqual([...taggedNames].sort())
})

test('a method is tagged on both clients or on neither', () => {
  const { methods } = tagged()
  const mixed = [...methods].filter(([, e]) => e.length !== 2 || e[0] !== e[1])
  expect(mixed).toEqual([])
})

test('the owner-agreed items are experimental, and prDiff is stable', () => {
  expect(readmeExperimental().sort()).toEqual(
    [
      'CreateReviewOptions',
      'ReviewComment',
      'createReview',
      'issueCommentEdit',
      'graphql',
      'nodesAt',
      'GraphqlOptions',
      'GraphqlVariable',
    ].sort(),
  )
  expect(tagged().exports.get('prDiff')).toBe(false)
})
