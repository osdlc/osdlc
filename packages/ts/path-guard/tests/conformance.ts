/**
 * Runs the path-guard conformance suite's cases against this package.
 *
 * `packages/conformance/path-guard/suite.json` is the family's suite, and this
 * package is its reference implementation. `conformance-write.ts` calls
 * {@link run} to write each case's `expect` or `error`, and
 * `conformance.test.ts` calls it to check them, so the two cannot drift.
 *
 * The guard reads `process.platform` once, when it loads. `run` reads it the
 * same way, so a module loaded as on Windows answers as Windows does.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'

import { PathError, PathGuard, lexical, type PathWarning, type Resolver } from '../src/index.ts'
import { nodeGuard } from '../src/node.ts'

/** The suite file, by its path in the repository. */
export const SUITE_PATH = join(import.meta.dirname, '../../../conformance/path-guard/suite.json')

export interface Case {
  name: string
  input: Record<string, unknown>
  expect?: Record<string, unknown>
  error?: { kind: string; message?: string }
  platforms?: string[]
  skip?: Record<string, string>
}

export interface Suite {
  family: string
  reference: string
  referenceVersion: string
  sections: Record<string, { description: string; cases: Case[] }>
}

/** What a case gives: its `expect`, or its `error`. */
export type Outcome = { expect: Record<string, unknown> } | { error: { kind: string } }

export function readSuite(): Suite {
  return JSON.parse(readFileSync(SUITE_PATH, 'utf8')) as Suite
}

/** The keys a case may set. */
export const CASE_KEYS = ['name', 'input', 'expect', 'error', 'platforms', 'skip']

const TREE = ['dirs', 'files', 'links']

/** Every section this implementation runs, with the keys its `input` may hold. */
export const INPUT_KEYS: Record<string, string[]> = {
  validate_relative: ['path'],
  windows_names: ['path'],
  resolve: ['root', 'path'],
  resolve_windows_names: ['path'],
  contains: ['outer', 'inner'],
  absolute: ['path', 'cwd'],
  is_under: ['root', 'path'],
  to_relative: ['root', 'path'],
  resolve_on_disk: [...TREE, 'root', 'path'],
  contains_on_disk: [...TREE, 'outer', 'inner'],
  real_path: [...TREE, 'path'],
}

export const WINDOWS = process.platform === 'win32'

/** The platform name a case's `platforms` uses for this host. */
export const HOST = WINDOWS ? 'windows' : 'unix'

/** A path the guard returned, in the suite's `/` spelling. Windows answers with `\`. */
const slashed = (path: string) => (WINDOWS ? path.replaceAll('\\', '/') : path)

/**
 * The guard sections use POSIX roots such as `/v`, which are not absolute on
 * Windows. There they go on drive `C:`, and the drive comes off the answer.
 */
const DRIVE = WINDOWS ? 'C:' : ''
const onHost = (path: string) => (path.startsWith('/') ? DRIVE + path : path)
const fromHost = (path: string) => {
  const p = slashed(path)
  return DRIVE !== '' && p.startsWith(`${DRIVE}/`) ? p.slice(DRIVE.length) : p
}

/** The root `resolve_windows_names` resolves under on this host. */
const NAMES_ROOT = WINDOWS ? 'C:\\v' : '/v'

function enoent(): never {
  throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
}

/** A filesystem in which nothing exists, as the Rust side's `Nothing`. */
export const nothing: Resolver = { realpath: enoent, readlink: enoent }

/** The tree a case builds in a scratch directory. */
export interface Tree {
  dirs?: string[]
  files?: string[]
  /** Link path to target text. A target starting with `/` is rooted at the scratch directory. */
  links?: Record<string, string>
}

/** Builds `tree` under a fresh scratch directory, runs `run` on it, and removes it. */
export function inScratch<T>(tree: Tree, run: (scratch: string) => T): T {
  const scratch = mkdtempSync(join(tmpdir(), 'path-guard-conformance-'))
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

/** Is the real path of `path` the real path of `root`, or beneath it? Both must exist. */
export function landsIn(root: string, path: string): boolean {
  const [r, p] = [realpathSync.native(root), realpathSync.native(path)]
  return p === r || p.startsWith(r.endsWith(sep) ? r : r + sep)
}

/** `{ expect: shape(value) }`, or `{ error }` for a `PathError`. Any other throw goes through. */
function outcome<T>(run: () => T, shape: (value: T) => Record<string, unknown>): Outcome {
  let value: T
  try {
    value = run()
  } catch (e) {
    if (e instanceof PathError) return { error: { kind: e.kind } }
    throw e
  }
  return { expect: shape(value) }
}

/** A refusal comes with no warning: the suite cannot say otherwise, so a warning fails. */
function noWarnings(got: Outcome, warnings: PathWarning[], name: string): Outcome {
  if ('error' in got && warnings.length > 0) {
    throw new Error(`${name}: refused, yet warned ${JSON.stringify(warnings)}`)
  }
  return got
}

const path = (p: string) => ({ path: p })

/** Every key an `input` may hold. {@link INPUT_KEYS} says which a section uses. */
interface Input extends Tree {
  path: string
  root: string
  cwd: string
  outer: string
  inner: string
}

/** The outcome this package gives for one case of a section, on this host. */
export function run(section: string, raw: Record<string, unknown>): Outcome {
  const allowed = INPUT_KEYS[section]
  if (allowed === undefined) {
    throw new Error(`the suite has a section this implementation does not know: ${section}`)
  }
  const unknown = Object.keys(raw).filter((k) => !allowed.includes(k))
  if (unknown.length > 0) throw new Error(`${section}: unknown input keys ${unknown.join(', ')}`)
  const input = raw as unknown as Input
  switch (section) {
    case 'validate_relative':
      return outcome(() => lexical.validateRelative(input.path), path)
    case 'windows_names': {
      const warnings: PathWarning[] = []
      const got = outcome(
        () => lexical.validateRelative(input.path, { onWarning: (w) => warnings.push(w) }),
        () => ({ warnings }),
      )
      return noWarnings(got, warnings, section)
    }
    case 'resolve':
      return outcome(
        () => new PathGuard(nothing).resolve(onHost(input.root), input.path),
        (p) => path(fromHost(p)),
      )
    case 'resolve_windows_names': {
      const warnings: PathWarning[] = []
      const guard = new PathGuard(nothing, { onWarning: (w) => warnings.push(w) })
      const got = outcome(
        () => guard.resolve(NAMES_ROOT, input.path),
        (p) => ({ path: slashed(p).slice(slashed(NAMES_ROOT).length + 1), warnings }),
      )
      return noWarnings(got, warnings, section)
    }
    case 'contains':
      return outcome(
        () => new PathGuard(nothing).contains(onHost(input.outer), onHost(input.inner)),
        (contains) => ({ contains }),
      )
    case 'absolute':
      return outcome(() => lexical.absolute(input.path, input.cwd), path)
    case 'is_under':
      return outcome(
        () => lexical.isUnder(input.root, input.path),
        (under) => ({ under }),
      )
    case 'to_relative':
      return outcome(() => lexical.toRelative(input.root, input.path), path)
    case 'resolve_on_disk':
      return inScratch(input, (scratch) =>
        outcome(
          () => nodeGuard.resolve(join(scratch, input.root), input.path),
          (p) => path(slashed(p.slice(scratch.length + 1))),
        ),
      )
    case 'contains_on_disk':
      return inScratch(input, (scratch) => {
        // Concatenated, not `join`ed, which would fold the `..`.
        const [outer, inner] = [`${scratch}/${input.outer}`, `${scratch}/${input.inner}`]
        const got = outcome(
          () => nodeGuard.contains(outer, inner),
          (contains) => ({ contains }),
        )
        // Then create `inner` and see whether the filesystem put it inside `outer`.
        mkdirSync(inner, { recursive: true })
        const landed = landsIn(outer, inner)
        if (!('expect' in got) || got.expect['contains'] !== landed) {
          throw new Error(`${JSON.stringify(got)}, but the filesystem puts it inside: ${landed}`)
        }
        return got
      })
    case 'real_path':
      return inScratch(input, (scratch) => {
        const real = realpathSync.native(scratch)
        const rooted = input.path.startsWith('/') ? join(real, input.path) : input.path
        return outcome(
          () => nodeGuard.realPath(rooted),
          (p) => path(p.startsWith(real + sep) ? slashed(p.slice(real.length)) : slashed(p)),
        )
      })
    default:
      throw new Error(`no runner for the section ${section}`)
  }
}
