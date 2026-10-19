import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import {
  PathError,
  contains,
  lexicalAbsolute,
  resolveInside,
  toRelative,
  validateRelative,
  type Resolver,
} from '../index.ts'

interface LexicalCase {
  name: string
  input: string
  ok?: string
  error?: string
}

interface ResolveCase extends LexicalCase {
  root: string
}

/** The tree a case builds in a scratch directory. */
interface Tree {
  dirs?: string[]
  files?: string[]
  /** Link path to target text. A target starting with `/` is rooted at the scratch directory. */
  links?: Record<string, string>
}

/** A {@link ResolveCase} run against a tree built in a scratch directory. */
interface OnDiskCase extends ResolveCase, Tree {}

interface ContainsCase {
  name: string
  outer: string
  inner: string
  expected: boolean
}

/** A {@link ContainsCase} run against a tree built in a scratch directory; paths are relative to it. */
interface ContainsOnDiskCase extends ContainsCase, Tree {}

interface Fixture {
  validate_relative: LexicalCase[]
  resolve: ResolveCase[]
  contains: ContainsCase[]
  /** Absolute inputs only, so the answer does not depend on the working directory. */
  lexical_absolute: LexicalCase[]
  to_relative: ResolveCase[]
  resolve_on_disk: OnDiskCase[]
  contains_on_disk: ContainsOnDiskCase[]
}

/**
 * The one parity fixture lives in the Rust crate, which its `tests/parity.rs`
 * also reads. This suite reads it by its path in the repository, so a case added
 * on either side goes in the fixture, never in one twin's own suite.
 */
const FIXTURE_PATH = join(
  import.meta.dirname,
  '../../../rust/path-guard/tests/fixtures/parity.json',
)
const f = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8')) as Fixture

const WINDOWS = process.platform === 'win32'

/** A path the guard returned, in the fixture's `/` spelling. Windows answers with `\`. */
const slashed = (path: string) => (WINDOWS ? path.replaceAll('\\', '/') : path)

function enoent(): never {
  throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
}

/** A filesystem in which nothing exists, as the Rust side's `Nothing`. */
const nothing: Resolver = { realpath: enoent, readlink: enoent }

/** `{ ok }` or `{ error: kind }`, the fixture's spelling of an outcome. */
function outcome(run: () => string): { ok: string } | { error: string } {
  try {
    return { ok: run() }
  } catch (e) {
    if (e instanceof PathError) return { error: e.kind }
    throw e
  }
}

function expected(c: LexicalCase): { ok: string } | { error: string } {
  if ((c.ok === undefined) === (c.error === undefined)) {
    throw new Error(`case ${JSON.stringify(c.name)} must set exactly one of \`ok\` and \`error\``)
  }
  return c.ok !== undefined ? { ok: c.ok } : { error: c.error as string }
}

/** Builds `tree` under a fresh scratch directory, runs `run` on it, and removes it. */
function inScratch<T>(tree: Tree, run: (scratch: string) => T): T {
  const scratch = mkdtempSync(join(tmpdir(), 'path-guard-parity-'))
  try {
    for (const dir of tree.dirs ?? []) mkdirSync(join(scratch, dir), { recursive: true })
    for (const file of tree.files ?? []) writeFileSync(join(scratch, file), '')
    for (const [link, target] of Object.entries(tree.links ?? {})) {
      symlinkSync(target.startsWith('/') ? join(scratch, target) : target, join(scratch, link))
    }
    return run(scratch)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

/** Resolves `c.input` in `c`'s tree with the default resolver. */
function resolveOnDisk(c: OnDiskCase): { ok: string } | { error: string } {
  return inScratch(c, (scratch) => {
    const got = outcome(() => resolveInside(join(scratch, c.root), c.input))
    return 'ok' in got ? { ok: slashed(got.ok.slice(scratch.length + 1)) } : got
  })
}

/** Answers `contains` in `c`'s tree with the default resolver. Concatenated, not `join`ed, which would fold the `..`. */
function containsOnDisk(c: ContainsOnDiskCase): boolean {
  return inScratch(c, (scratch) => contains(`${scratch}/${c.outer}`, `${scratch}/${c.inner}`))
}

describe('shared parity fixture', () => {
  test('every section has cases', () => {
    expect(f.validate_relative.length).toBeGreaterThan(0)
    expect(f.resolve.length).toBeGreaterThan(0)
    expect(f.contains.length).toBeGreaterThan(0)
    expect(f.lexical_absolute.length).toBeGreaterThan(0)
    expect(f.to_relative.length).toBeGreaterThan(0)
    expect(f.resolve_on_disk.length).toBeGreaterThan(0)
    expect(f.contains_on_disk.length).toBeGreaterThan(0)
  })

  describe('validateRelative', () => {
    for (const c of f.validate_relative) {
      test(c.name, () => {
        expect(outcome(() => validateRelative(c.input))).toEqual(expected(c))
      })
    }
  })

  describe('resolveInside', () => {
    for (const c of f.resolve) {
      test(c.name, () => {
        const got = outcome(() => resolveInside(c.root, c.input, nothing))
        expect('ok' in got ? { ok: slashed(got.ok) } : got).toEqual(expected(c))
      })
    }
  })

  describe('contains', () => {
    for (const c of f.contains) {
      test(c.name, () => {
        expect(contains(c.outer, c.inner, nothing)).toBe(c.expected)
      })
    }
  })

  // The inputs are POSIX absolute paths. On Windows they have no drive and take
  // the working directory's.
  describe.skipIf(WINDOWS)('lexicalAbsolute', () => {
    for (const c of f.lexical_absolute) {
      test(c.name, () => {
        expect(outcome(() => lexicalAbsolute(c.input))).toEqual(expected(c))
      })
    }
  })

  // `input` is the absolute path and `root` the root, as the Rust side's `to_relative`.
  describe('toRelative', () => {
    for (const c of f.to_relative) {
      test(c.name, () => {
        expect(outcome(() => toRelative(c.root, c.input))).toEqual(expected(c))
      })
    }
  })

  // A case with a `..` pins the POSIX rule, where `link/..` is the parent of the
  // link's target. Windows folds `..` as text first, so those run on POSIX only,
  // as the Rust suite does.
  const posixDotDot = (_c: object) => false

  describe('resolveInside on disk', () => {
    for (const c of f.resolve_on_disk) {
      test.skipIf(posixDotDot(c))(c.name, () => {
        expect(resolveOnDisk(c)).toEqual(expected(c))
      })
    }
  })

  describe('contains on disk', () => {
    for (const c of f.contains_on_disk) {
      test.skipIf(posixDotDot(c))(c.name, () => {
        expect(containsOnDisk(c)).toBe(c.expected)
      })
    }
  })
})
