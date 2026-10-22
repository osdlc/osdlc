/**
 * The public surface. Imports the package by its own name, so a build that
 * drops or renames an export fails here and not in a consumer.
 *
 * Vitest aliases the name to the source (vitest.config.ts); outside it the
 * name resolves to the built `dist/`.
 *
 * It also checks that `examples/` shows each export, except those on the
 * waiting list below.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

import * as pkg from '@osdlc/typed-gh'

const FUNCTIONS = [
  'anyCheckFailed',
  'api',
  'authStatus',
  'classifyGhFailure',
  'createLabel',
  'createPr',
  'createReview',
  'editLabel',
  'editPr',
  'editPrBody',
  'graphql',
  'installed',
  'issueCommentEdit',
  'issueList',
  'issueView',
  'labelList',
  'nodesAt',
  'normalizeAuthorLogin',
  'openPrsForBranch',
  'ownerRepoSlug',
  'parseOwnerRepo',
  'parsePrRef',
  'parsePrUrl',
  'parsePullRequest',
  'pickPrForBranch',
  'prBody',
  'prComment',
  'prDiff',
  'prList',
  'prMerge',
  'prReviewThreads',
  'prSetDraft',
  'prUpdateBranch',
  'prView',
  'repoList',
  'repoView',
  'searchPrs',
  'setIssueLabel',
]

const CLASSES = ['AsyncGh', 'CommandFailed', 'Gh']

const FIELD_LISTS = [
  'PR_LIST_FIELDS',
  'PR_REF_FIELDS',
  'PR_VIEW_FIELDS',
  'REPO_FIELDS',
  'SEARCH_PR_FIELDS',
]

describe('the package entry point', () => {
  test('exports exactly the documented runtime names', () => {
    const expected = [...FUNCTIONS, ...CLASSES, ...FIELD_LISTS, 'defaultRunnerFactory']
    expect(Object.keys(pkg).sort()).toEqual(expected.sort())
  })

  test('each function is a function', () => {
    for (const name of FUNCTIONS) {
      expect(typeof (pkg as Record<string, unknown>)[name]).toBe('function')
    }
    expect(typeof pkg.defaultRunnerFactory).toBe('function')
  })

  test('each class can be constructed or extended', () => {
    for (const name of CLASSES) {
      expect(typeof (pkg as Record<string, unknown>)[name]).toBe('function')
    }
    expect(new pkg.Gh('/repo')).toBeInstanceOf(pkg.Gh)
    expect(new pkg.AsyncGh('/repo')).toBeInstanceOf(pkg.AsyncGh)
    expect(new pkg.CommandFailed(['x'], { exitCode: 1, stdout: '', stderr: '' })).toBeInstanceOf(
      Error,
    )
  })

  test('each field list is a non-empty array of strings', () => {
    for (const name of FIELD_LISTS) {
      const list = (pkg as Record<string, unknown>)[name] as readonly unknown[]
      expect(Array.isArray(list)).toBe(true)
      expect(list.length).toBeGreaterThan(0)
      expect(list.every((f) => typeof f === 'string')).toBe(true)
    }
  })
})

// Exports with no example yet. Each waits on an open question, and a change
// there could rename or drop the item. Empty today.
const WAITING_FOR_THE_OWNER: ReadonlyArray<readonly [reason: string, names: readonly string[]]> = []

const WAITING = new Set(WAITING_FOR_THE_OWNER.flatMap(([, names]) => names))

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const EXAMPLE_FILES = readdirSync(join(ROOT, 'examples')).filter((f) => f.endsWith('.test.ts'))
const EXAMPLES = EXAMPLE_FILES.map((f) => readFileSync(join(ROOT, 'examples', f), 'utf8')).join(
  '\n',
)

/** Type names exported by `index.ts`, which have no runtime value to list. */
function exportedTypes(): string[] {
  const source = readFileSync(join(ROOT, 'src', 'index.ts'), 'utf8')
  const inline = Array.from(source.matchAll(/\btype\s+(\w+)/g), (m) => m[1] ?? '')
  const blocks = Array.from(source.matchAll(/export type \{([^}]*)\}/g), (m) => m[1] ?? '')
  const listed = blocks.flatMap((block) => block.split(',').map((name) => name.trim()))
  return [...inline, ...listed].filter(Boolean)
}

/** A call by bare name, as in `prList(...)`. */
const calls = (name: string) => new RegExp(`(?<![\\w.])${name}\\(`).test(EXAMPLES)
/** A call on a client, as in `gh.prList(...)`. */
const callsOnClient = (name: string) => new RegExp(`\\.\\s*${name}\\(`).test(EXAMPLES)
const mentions = (name: string) => new RegExp(`\\b${name}\\b`).test(EXAMPLES)

describe('the examples', () => {
  test('each one imports the package by name, not by path', () => {
    expect(EXAMPLE_FILES.length).toBeGreaterThan(0)
    for (const file of EXAMPLE_FILES) {
      const source = readFileSync(join(ROOT, 'examples', file), 'utf8')
      expect(source).toContain("from '@osdlc/typed-gh'")
      expect(source).not.toMatch(/from '\.{1,2}\//)
    }
  })

  test('every exported function is called', () => {
    const functions = [...FUNCTIONS, 'defaultRunnerFactory'].filter((n) => !WAITING.has(n))
    expect(functions.filter((name) => !calls(name))).toEqual([])
  })

  test('every method of Gh is called on a client', () => {
    // `exec` and `read` are private, so they are not part of the surface.
    const methods = Object.getOwnPropertyNames(pkg.Gh.prototype).filter(
      (n) =>
        n !== 'constructor' &&
        n !== 'exec' &&
        n !== 'read' &&
        // The doors are getters; examples/ drives them by their methods.
        n !== 'try' &&
        n !== 'soft' &&
        !WAITING.has(n),
    )
    expect(methods.length).toBeGreaterThan(0)
    expect(methods.filter((name) => !callsOnClient(name))).toEqual([])
  })

  test('every exported class and field list is used', () => {
    const names = [...CLASSES, ...FIELD_LISTS].filter((n) => !WAITING.has(n))
    expect(names.filter((name) => !mentions(name))).toEqual([])
  })

  test('every exported type is imported', () => {
    const types = exportedTypes()
    expect(types).toContain('PullRequest')
    expect(types.filter((n) => !WAITING.has(n)).filter((name) => !mentions(name))).toEqual([])
  })

  test('the waiting list names only exports that exist', () => {
    const known = new Set([
      ...Object.keys(pkg),
      ...Object.getOwnPropertyNames(pkg.Gh.prototype),
      ...exportedTypes(),
    ])
    expect([...WAITING].filter((name) => !known.has(name))).toEqual([])
  })
})
