/**
 * Runs the intersect conformance suite's cases against this package.
 *
 * `packages/conformance/intersect/suite.json` is the family's suite, and this
 * package is its reference implementation. `conformance-write.ts` calls
 * {@link run} to write each case's `expect` or `error`, and
 * `conformance.test.ts` calls it to check them, so the two cannot drift.
 */
import { readFileSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'

import * as fs from '../src/fs.ts'
import * as path from '../src/index.ts'
import * as segments from '../src/segments/index.ts'

/** The suite file, by its path in the repository. */
export const SUITE_PATH = join(import.meta.dirname, '../../../conformance/intersect/suite.json')

export interface Case {
  name: string
  input: Record<string, unknown>
  expect?: unknown
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
export type Outcome = { expect: unknown } | { error: { kind: string } }

export function readSuite(): Suite {
  return JSON.parse(readFileSync(SUITE_PATH, 'utf8')) as Suite
}

/** The keys a case may carry. */
export const CASE_KEYS = ['name', 'input', 'expect', 'error', 'platforms', 'skip']

const MATCH_OPTS = ['dot', 'caseInsensitive', 'globstarMatchesZero']
const FS_SETUP = ['tree', 'symlinks', 'unreadable', 'cwd', 'cwdRelative']
const FS_OPTS = [...MATCH_OPTS, 'ignore', 'onlyFiles', 'absolute']

interface Shape {
  /** The input keys a case must carry. */
  required: string[]
  /** The input keys it may carry besides `opts`. */
  optional: string[]
  /** The keys `opts` may carry. */
  opts: string[]
}

const pure = (...required: string[]): Shape => ({ required, optional: [], opts: MATCH_OPTS })

/** Every section this package runs, with the input its cases take. */
export const SECTIONS: Record<string, Shape> = {
  parse: { required: ['path'], optional: [], opts: ['separator'] },
  segments_intersects: pure('a', 'b'),
  segments_matches: pure('path', 'pattern'),
  segments_witness: pure('a', 'b'),
  intersects: pure('a', 'b'),
  matches: pure('path', 'patterns'),
  which_match: pure('path', 'patterns'),
  overlapping: pure('query', 'candidates'),
  witness: pure('a', 'b'),
  registry_applicable_to: pure('entries', 'scope'),
  registry_matching: pure('entries', 'path'),
  fs_files_in_scope: { required: ['tree', 'patterns'], optional: FS_SETUP, opts: FS_OPTS },
  fs_resolve_intersection: { required: ['tree', 'a', 'b'], optional: FS_SETUP, opts: FS_OPTS },
}

/** Throws unless `input` has exactly the shape its section takes. */
export function checkInput(section: string, input: Record<string, unknown>): void {
  const shape = SECTIONS[section]
  if (shape === undefined) {
    throw new Error(`the suite has a section this implementation does not know: ${section}`)
  }
  const allowed = [...shape.required, ...shape.optional, 'opts']
  const unknown = Object.keys(input).filter((k) => !allowed.includes(k))
  if (unknown.length > 0) throw new Error(`${section}: unknown input keys ${unknown.join(', ')}`)
  const missing = shape.required.filter((k) => !(k in input))
  if (missing.length > 0) throw new Error(`${section}: missing input keys ${missing.join(', ')}`)
  const opts = (input['opts'] ?? {}) as Record<string, unknown>
  const unknownOpts = Object.keys(opts).filter((k) => !shape.opts.includes(k))
  if (unknownOpts.length > 0) {
    throw new Error(`${section}: unknown opts keys ${unknownOpts.join(', ')}`)
  }
}

/** Whether this process can make a directory unreadable: not on Windows, not as root. */
function canLockDirectories(): boolean {
  return process.platform !== 'win32' && process.getuid?.() !== 0
}

/**
 * Whether this host can run a case at all. A case with `unreadable` cannot run
 * as root, where mode 000 does not stop a read. (Its `platforms` already keeps
 * it off Windows.)
 */
export function canRunHere(input: Record<string, unknown>): boolean {
  const locked = (input['unreadable'] as string[] | undefined) ?? []
  return locked.length === 0 || canLockDirectories()
}

/** The `kind` the suite writes for this package's error code. */
function kindOf(err: unknown): string {
  if (!(err instanceof path.IntersectError)) throw err
  return err.code.toLowerCase()
}

async function outcome(call: () => unknown): Promise<Outcome> {
  try {
    return { expect: await call() }
  } catch (err) {
    return { error: { kind: kindOf(err) } }
  }
}

function runPure(section: string, input: Record<string, unknown>): unknown {
  // Each input is cast to what the call takes; `checkInput` checked its keys.
  const i = (key: string): never => input[key] as never
  const opts = input['opts'] as path.Options | undefined
  switch (section) {
    case 'parse':
      return path.parse(i('path'), i('opts'))
    case 'segments_intersects':
      return segments.intersects(i('a'), i('b'), opts)
    case 'segments_matches':
      return segments.matches(i('path'), i('pattern'), opts)
    case 'segments_witness':
      return segments.witness(i('a'), i('b'), opts)
    case 'intersects':
      return path.intersects(i('a'), i('b'), opts)
    case 'matches':
      return path.matches(i('path'), i('patterns'), opts)
    case 'which_match':
      return path.whichMatch(i('path'), i('patterns'), opts)
    case 'overlapping':
      return path.overlapping(i('query'), i('candidates'), opts)
    case 'witness':
      return path.witness(i('a'), i('b'), opts)
    case 'registry_applicable_to':
      return path.index(i('entries'), opts).applicableTo(i('scope'))
    case 'registry_matching':
      return path.index(i('entries'), opts).matching(i('path'))
    default:
      throw new Error(`not a pure section: ${section}`)
  }
}

/**
 * Builds the case's `tree`, `symlinks` and `unreadable` directories under a
 * new temp directory, runs `body` on it, then removes it.
 */
async function withTree<T>(
  input: Record<string, unknown>,
  body: (root: string) => Promise<T>,
): Promise<T> {
  if (!canRunHere(input)) throw new Error('this host cannot make a directory unreadable')
  const locked = (input['unreadable'] as string[] | undefined) ?? []
  const root = await mkdtemp(join(tmpdir(), 'intersect-fs-'))
  try {
    for (const rel of input['tree'] as string[]) {
      const abs = join(root, rel)
      await mkdir(dirname(abs), { recursive: true })
      await writeFile(abs, '')
    }
    const links = (input['symlinks'] as Record<string, string> | undefined) ?? {}
    for (const [link, target] of Object.entries(links)) {
      const abs = join(root, link)
      await mkdir(dirname(abs), { recursive: true })
      await symlink(target, abs)
    }
    for (const dir of locked) await chmod(join(root, dir), 0o000)
    return await body(root)
  } finally {
    for (const dir of locked) await chmod(join(root, dir), 0o755).catch(() => undefined)
    await rm(root, { recursive: true, force: true })
  }
}

/**
 * Runs an fs case. With `opts.absolute`, each path must be absolute and under
 * the temp directory, and comes back relative to it, `/`-separated, as the
 * suite states it.
 */
function runFs(section: string, input: Record<string, unknown>): Promise<string[]> {
  return withTree(input, async (root) => {
    const sub = input['cwd'] as string | undefined
    const abs = sub === undefined ? root : join(root, sub)
    const cwd = input['cwdRelative'] === true ? relative(process.cwd(), abs) : abs
    const opts: fs.FsOptions = { ...(input['opts'] as fs.FsOptions | undefined), cwd }
    const got =
      section === 'fs_files_in_scope'
        ? await fs.filesInScope(input['patterns'] as path.Patterns, opts)
        : await fs.resolveIntersection(
            input['a'] as path.Patterns,
            input['b'] as path.Patterns,
            opts,
          )
    if (opts.absolute !== true) return got
    return got.map((p) => {
      if (!isAbsolute(p) || !p.startsWith(root + sep)) {
        throw new Error(`${p} is not an absolute path under ${root}`)
      }
      return relative(root, p).split(sep).join('/')
    })
  })
}

/** The outcome this package gives for one case of a section. */
export function run(section: string, input: Record<string, unknown>): Promise<Outcome> {
  checkInput(section, input)
  if (section.startsWith('fs_')) return outcome(() => runFs(section, input))
  return outcome(() => runPure(section, input))
}
