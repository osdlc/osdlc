/**
 * `sdlc task resolve <arg>` — deterministic task-file resolution.
 *
 * The op-substrate home of the procedure specified in
 * `solutions/ontological/lib/model/entities/task/file-resolution.md` ([[P-0001]] /
 * [[D-0007-deterministic-op-substrate]] §2a): every skill that takes a
 * `<slug-or-filename>` / `<absolute-path>` argument resolves it by ONE
 * deterministic rule instead of re-implementing the prose. The handler is
 * PURE — no LLM, no shell — so the same arg always resolves the same way.
 *
 * Resolution order (see that doc):
 *   1. Absolute path — use directly. Missing → NO TASK FOUND.
 *   2. Relative path — only when the arg contains a path separator: a file
 *      relative to the op's cwd (`ctx.cwd`). Not a file → falls through.
 *   3. Exact filename match in `docs/planning/tasks/` of ANY planning root,
 *      with or without a trailing `.md`.
 *   4. Glob match against `docs/planning/tasks/<arg>*.md` then
 *      `docs/planning/tasks/*<arg>*.md`. Exactly one → use it; multiple →
 *      ambiguous (the spec's non-interactive policy: AMBIGUOUS marker).
 *   5. No match → NO TASK FOUND.
 *
 * "Any planning root" is every project in the git checkout holding the
 * project root (`planningRoots`), the project root itself first. Steps 3 and 4
 * search the UNION of their tasks dirs, so an exact match anywhere beats a
 * glob match anywhere, and one id in two roots is ambiguous.
 *
 * After resolution the op captures the absolute `path` and the `basename`
 * (filename without `.md`).
 *
 * Terminal markers + exit codes (emitted by the `cli.render` hook, mirroring
 * `task next`'s cycle marker — the handler itself never throws for a normal
 * not-found / ambiguous outcome):
 *   - resolved        → the absolute path on stdout, exit 0.
 *   - not-found       → `NO TASK FOUND for "<arg>"` on stderr, exit 1.
 *   - ambiguous       → `AMBIGUOUS: <comma-separated candidate absolute paths>` on
 *                       stderr, exit 1. Interactive disambiguation, when a
 *                       caller wants it, reads the structured `candidates`.
 *
 * The "glob" here matches the arg as a LITERAL prefix / substring of the
 * basename (not a shell/glob pattern), so a slug containing glob
 * metacharacters resolves by its plain text — the faithful reading of the
 * `<arg>*.md` / `*<arg>*.md` forms.
 */

import { readdirSync } from 'node:fs'
import { basename as pathBasename, isAbsolute, join, resolve, sep } from 'node:path'

import { checkoutRoot } from '@osdlc/typed-git'
import { z } from 'zod'

import { defineOp } from '@lib/registry'
import { isFile } from '@lib/util/fs'
import { planningRoots } from '@lib/util/planning-roots'

// ---------------------------------------------------------------------------
// Terminal markers — verbatim from file-resolution.md. Exported so callers
// (and the test suite) assert against the single source of truth.
// ---------------------------------------------------------------------------

/** Prefix of the no-match / missing-absolute-path marker. */
export const NO_TASK_FOUND_PREFIX = 'NO TASK FOUND for '

/** The full `NO TASK FOUND for "<arg>"` marker for a given arg. */
export function noTaskFoundMarker(arg: string): string {
  return `${NO_TASK_FOUND_PREFIX}"${arg}"`
}

/** Prefix of the non-interactive ambiguity marker. */
export const AMBIGUOUS_MARKER_PREFIX = 'AMBIGUOUS: '

/** The full `AMBIGUOUS: <comma-separated candidate absolute paths>` marker. */
export function ambiguousMarker(candidates: string[]): string {
  return `${AMBIGUOUS_MARKER_PREFIX}${candidates.join(',')}`
}

const TASKS_SUBPATH = ['docs', 'planning', 'tasks'] as const
const MD_EXT = '.md'

/** List the `.md` filenames in the tasks dir, sorted; [] when the dir is absent. */
function listTaskFiles(tasksDir: string): string[] {
  let entries: string[]
  try {
    entries = readdirSync(tasksDir)
  } catch {
    return []
  }
  return entries.filter((e) => e.endsWith(MD_EXT)).sort()
}

// ---------------------------------------------------------------------------
// Pure resolution core (no ctx, no I/O beyond fs reads) — the testable unit.
// ---------------------------------------------------------------------------

type ResolveReason = 'absolute' | 'relative' | 'exact' | 'glob' | 'ambiguous' | 'not-found'

interface ResolveResult {
  arg: string
  resolved: boolean
  reason: ResolveReason
  path: string | null
  basename: string | null
  candidates: string[]
}

function found(arg: string, reason: ResolveReason, absPath: string): ResolveResult {
  return {
    arg,
    resolved: true,
    reason,
    path: absPath,
    basename: pathBasename(absPath, MD_EXT),
    candidates: [],
  }
}

function notFound(arg: string): ResolveResult {
  return { arg, resolved: false, reason: 'not-found', path: null, basename: null, candidates: [] }
}

function ambiguous(arg: string, candidates: string[]): ResolveResult {
  return { arg, resolved: false, reason: 'ambiguous', path: null, basename: null, candidates }
}

/** Every project root the lookup searches: `projectRoot` first, then the checkout's other projects. */
function searchRoots(projectRoot: string): string[] {
  const roots = planningRoots(checkoutRoot(projectRoot) ?? projectRoot)
  return [projectRoot, ...roots.filter((r) => resolve(r) !== resolve(projectRoot))]
}

/** Absolute paths of the task files whose stem passes `keep`, across `tasksDirs`, sorted. */
function matchingFiles(tasksDirs: string[], keep: (stem: string) => boolean): string[] {
  const hits: string[] = []
  for (const dir of tasksDirs) {
    for (const file of listTaskFiles(dir)) {
      if (keep(file.slice(0, -MD_EXT.length))) hits.push(join(dir, file))
    }
  }
  return hits.sort()
}

/** Turn a hit list into a result: one → `found`, several → ambiguous, none → undefined. */
function fromHits(arg: string, reason: ResolveReason, hits: string[]): ResolveResult | undefined {
  if (hits.length === 1) return found(arg, reason, hits[0]!)
  if (hits.length > 1) return ambiguous(arg, hits)
  return undefined
}

/**
 * Resolve `arg` against the `docs/planning/tasks/` of every planning root per
 * file-resolution.md; a relative path resolves against `cwd`. Pure: only fs
 * reads, never throws for a normal not-found / ambiguous outcome.
 */
export function resolveTaskFile(projectRoot: string, arg: string, cwd: string): ResolveResult {
  // 1. Absolute path — use directly; missing → not found.
  if (isAbsolute(arg)) {
    return isFile(arg) ? found(arg, 'absolute', arg) : notFound(arg)
  }

  // 2. Relative path — only an arg that spells a path; a bare id never is one.
  if (arg.includes(sep) || arg.includes('/')) {
    const relPath = resolve(cwd, arg)
    if (isFile(relPath)) return found(arg, 'relative', relPath)
  }

  const tasksDirs = searchRoots(projectRoot).map((root) => join(root, ...TASKS_SUBPATH))

  // 3. Exact filename match, with or without a trailing `.md`.
  const argBase = arg.endsWith(MD_EXT) ? arg.slice(0, -MD_EXT.length) : arg
  const exact = fromHits(
    arg,
    'exact',
    matchingFiles(tasksDirs, (stem) => stem === argBase),
  )
  if (exact !== undefined) return exact

  // 4. Glob match: `<arg>*.md` then `*<arg>*.md`. The arg is a literal
  //    prefix / substring of the basename (the `.md`-stripped filename).
  const prefix = fromHits(
    arg,
    'glob',
    matchingFiles(tasksDirs, (stem) => stem.startsWith(argBase)),
  )
  if (prefix !== undefined) return prefix
  const substring = fromHits(
    arg,
    'glob',
    matchingFiles(tasksDirs, (stem) => stem.includes(argBase)),
  )
  if (substring !== undefined) return substring

  // 5. No match.
  return notFound(arg)
}

/** A task id: a type letter and its key (`T-QNZJ`, `T-0001`). */
const TASK_ID_RE = /^[A-Z]+-[A-Z0-9]+$/

/**
 * Resolve `arg` for a caller that does not trust it (a PR footer's `task=`):
 * only a basename (with or without `.md`) or a task id, matched exactly — a
 * basename equal to `arg`, or for an id, a basename of `<id>` or
 * `<id>-<slug>`. A path, a dot segment, or a partial name resolves nothing,
 * so the text cannot point at an arbitrary file or glob onto some task.
 */
export function resolveTaskExact(projectRoot: string, arg: string): ResolveResult {
  if (arg === '' || arg.includes('/') || arg.includes('\\') || arg.startsWith('.')) {
    return notFound(arg)
  }
  const argBase = arg.endsWith(MD_EXT) ? arg.slice(0, -MD_EXT.length) : arg
  const isId = TASK_ID_RE.test(argBase)
  const tasksDirs = searchRoots(projectRoot).map((root) => join(root, ...TASKS_SUBPATH))
  const hits = matchingFiles(
    tasksDirs,
    (stem) => stem === argBase || (isId && stem.startsWith(`${argBase}-`)),
  )
  return fromHits(arg, 'exact', hits) ?? notFound(arg)
}

// ---------------------------------------------------------------------------
// Op descriptor
// ---------------------------------------------------------------------------

const input = z.object({
  projectRoot: z.string(),
  /** The argument naming a task: absolute path, relative path, filename, or slug. */
  arg: z.string(),
})

const reason = z.enum(['absolute', 'relative', 'exact', 'glob', 'ambiguous', 'not-found'])

const output = z.object({
  /** Echo of the input arg (so the marker text can be reproduced downstream). */
  arg: z.string(),
  /** True iff a single task file was resolved. */
  resolved: z.boolean(),
  /** Which rule resolved (or failed to resolve) the arg. */
  reason,
  /** Absolute path to the resolved task file, or null. */
  path: z.string().nullable(),
  /** Resolved filename without `.md`, or null. */
  basename: z.string().nullable(),
  /**
   * Matching absolute paths when `reason === "ambiguous"`, sorted;
   * empty otherwise. A caller wanting interactive disambiguation reads this.
   */
  candidates: z.array(z.string()),
})

export default defineOp({
  path: ['task', 'resolve'],
  summary:
    'Resolve an arg naming a task (absolute or relative path / filename / slug) to its task file, searching every planning root in the repo (deterministic, per file-resolution.md).',
  // Read-only: resolves an arg to a task path via fs reads only; writes
  // nothing.
  mutating: false,
  input,
  output,
  cli: {
    positionals: ['arg'],
    render: (out, io) => {
      if (out.resolved) {
        io.stdout(`${out.path}\n`)
        return 0
      }
      if (out.reason === 'ambiguous') {
        io.stderr(`${ambiguousMarker(out.candidates)}\n`)
        return 1
      }
      io.stderr(`${noTaskFoundMarker(out.arg)}\n`)
      return 1
    },
  },
  handler: (args, ctx) => {
    // The registry adapter injects `--project-root` into `args.projectRoot`;
    // fall back to the ctx root for direct invokeOp callers.
    const projectRoot = args.projectRoot !== '' ? args.projectRoot : ctx.projectRoot
    return resolveTaskFile(projectRoot, args.arg, ctx.cwd)
  },
})
