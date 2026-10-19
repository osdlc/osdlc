/**
 * `sdlc task ensure-ready-mutate` — apply /sdlc:task-ensure-ready's pass/fail
 * verdict, by PLANE.
 *
 * Ported off `bun run ${CLAUDE_PLUGIN_ROOT}/skills/task-ensure-ready/ensure_ready_mutate.ts`
 * onto the op substrate ([[T-VAW3]] AC-2): that entry point's relative
 * `../../../../../lib/...` imports resolved only by accident of the in-repo
 * layout and broke once the plugin was copied outside this checkout.
 * `CliHints.rawArgv` (this op's own `main`/`defineCli` argv parsing, unchanged)
 * is the escape hatch — see its doc comment on `CliHints` in `lib/registry.ts`.
 *
 * The retired script also shelled a `bun run <path-to-cli/sdlc.ts>` SUBPROCESS
 * for `entities validate` and `lease release` — the exact `import.meta.url`-
 * relative path-guessing this whole migration exists to retire, and doubly
 * broken once bundled into the compiled binary (there is no `cli/sdlc.ts` on
 * disk to shell out to at all). Both now call the sibling op's `.handler`
 * directly, in-process — the established pattern for one op reusing another's
 * logic (see e.g. `lib/services/orchestrator/ticks/work.ts`).
 *
 * The readiness gate writes to whichever plane owns the fact
 * ([[D-S30G-task-state-plane-split]]). Four behaviors, keyed on
 * (active lease?) x (pass/fail):
 *
 * | Case | Behavior |
 * |---|---|
 * | Pass, unleased, `planning/*` | ONE promotion commit: `state: open/ready` + `readiness_verified_at` (+ drop `definition_gap`). Promotion IS the readiness claim. |
 * | Pass, unleased, already `open/ready` | No-op — the file stays byte-identical. Unless a `definition_gap` is present: clearing it is a semantic edit and keeps its commit. The stamp is never refreshed. |
 * | Pass, active lease | CAS-write the lease `gates` only. Zero commits on main, no frontmatter write. |
 * | Fail | Downshift to `planning/needs-definition` + `definition_gap` — except the carve-out, which preserves state when the input is `in-progress*` OR an active lease exists (post-split a leased task reads `open/ready`, and downshifting it would corrupt live work). |
 *
 * Under `--commit-on` the commit is built from `origin/<target>`'s copy of the file: it carries
 * frontmatter state only. A task-body edit in the caller's worktree is neither read nor written
 * here; it travels in the task branch's PR, and nothing asks the caller to push it to the target.
 *
 * Terminal markers (slug-namespaced per skills/CLAUDE.md):
 *
 *     ENSURE-READY-OK: <basename>
 *     readiness_verified_at: <iso|->
 *     plane: frontmatter-promotion | lease-gates | none
 *
 *     ENSURE-READY-NEEDS-DEFINITION: <basename>
 *     definition_gap: <first line of gap>
 *
 *     ENSURE-READY-LEASED: <basename>
 *
 * Exit codes ([[S-0015-standalone-cli-shape]] rule 4): 0 ok / 1 the command
 * failed against the state it found / 2 the command was typed wrong / 12
 * (`LEASE_CONFLICT`) `--commit` refused because an active lease exists / 19
 * the commit or the lease write was refused-or-failed / 20 the input state is
 * not one this gate accepts.
 *
 * Frontmatter edits are span-preserving (`lib/util/frontmatter.ts`): the block
 * is never re-emitted whole.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve, basename as pathBasename } from 'node:path'

import { z } from 'zod'

import { defineCli, EXIT, type CliContext, type CliIo } from '@sksizer/cli-tool'
import type { FieldEdit } from '@sksizer/yaml-splice'
import { CommandFailed, Git, type GitOutcome } from '@osdlc/typed-git'

import { editFrontmatterFields, parseFrontmatterResult } from '@lib/util/frontmatter'
import { isFile } from '@lib/util/fs'
import { mainCheckoutFrom, worktreeDir } from '@lib/util/git'
import { isGeneratedDocsPath } from '@lib/util/generated-docs'
import { callSync, createCtx, defineOp, exitCodeFor, OpError, type OpCtx } from '@lib/registry'
import { repr } from '@lib/util/diagnostics'
import { regenerateAndListChanged } from '@lib/services/docs/generate'
import { stateBranch } from '@lib/services/orchestrator/target-branch'
import { CommitToMainError, commitToMainViaWorktree } from '@lib/services/git/commit-to-main'
import {
  LeaseError,
  NON_EXPIRING_PHASES,
  fetchLease,
  resolveAuthority,
  updateLeaseGates,
  type TaskLifecycleLease,
} from '@lib/services/lease/index'
import { spawnRunner } from '@lib/util/command'
import validateOp from '@lib/model/ops/validate'
import releaseOp from '@lib/services/lease/ops/release'

import { renderTaskLifecycleCommit } from '../commits/lifecycle/schema.ts'
import { readTask } from '../read.ts'
import { legacyCliContext } from '@lib/util/legacy-cli.ts'

/**
 * The commit or the lease write was refused or failed. 19 continues sdlc's
 * op-error numbering (`OP_ERROR_EXIT_CODES` in lib/registry.ts ends at 21), so
 * no sdlc exit number means two things.
 */
const EXIT_WRITE_REFUSED = 19

/** The task's state is not one this gate accepts as input. */
const EXIT_UNACCEPTABLE_STATE = 20

const ALLOWED_INPUT_STATES = new Set([
  'planning/draft',
  'planning/proposed',
  'planning/backlog',
  'open/ready',
  'in-progress',
  'in-progress/blocked',
])
const IN_PROGRESS_STATES = new Set(['in-progress', 'in-progress/blocked'])
const DOWNSHIFT_STATE = 'planning/needs-definition'
const PROMOTED_STATE = 'open/ready'
const PLANNING_PREFIX = 'planning/'

/** Which plane a pass verdict landed on — the marker's third line. */
type Plane = 'frontmatter-promotion' | 'lease-gates' | 'none'

// Exit code carrier so we can mirror Python's `raise SystemExit(n)`.
class ExitError extends Error {
  code: number
  constructor(code: number) {
    super(`exit ${code}`)
    this.code = code
  }
}

/** What an unleased pass has to write to the frontmatter plane. */
interface PassPlan {
  edits: FieldEdit[]
  /** The stamp this pass writes to frontmatter, or null when it writes none. */
  stamp: string | null
}

/**
 * Plan the pass mutation for the FRONTMATTER plane (the unleased case).
 *
 * A `planning/*` task is promoted: one edit batch carries the state flip AND
 * the stamp, because promotion IS the readiness claim
 * ([[D-S30G-task-state-plane-split]]). Already `open/ready` tasks get no state
 * change and no stamp refresh — the stamp records "was ready when promoted",
 * a question re-verification cannot answer. Clearing `definition_gap` is the
 * only edit on that path (it is semantic), so it keeps its commit.
 *
 * `editYaml` applies edits with span-preservation: fresh promotions append the
 * stamp last; humans who moved it keep their ordering. `Remove` is guarded —
 * `editYaml` refuses to remove a missing key.
 */
function planPassEdits(fm: Record<string, unknown>, nowIso: string): PassPlan {
  const edits: FieldEdit[] = []
  if ('definition_gap' in fm) edits.push({ Remove: { key: 'definition_gap' } })

  const state = fm['state']
  const promoting = typeof state === 'string' && state.startsWith(PLANNING_PREFIX)
  if (!promoting) return { edits, stamp: null }

  edits.push({ Set: { key: 'state', value: PROMOTED_STATE } })
  edits.push({ Set: { key: 'readiness_verified_at', value: nowIso } })
  return { edits, stamp: nowIso }
}

/**
 * Plan the fail mutation, as a span-preserving edit batch.
 *
 * The carve-out preserves state for work that is mid-flight — legacy
 * `in-progress*` frontmatter OR an active lease. A leased task reads
 * `open/ready` for its whole run, so without the lease arm a standalone fail
 * would downshift live work ([[D-S30G-task-state-plane-split]]).
 *
 * Under an active lease the promotion stamp is preserved too: the promotion
 * happened and the fail does not un-happen it; this run's verdict belongs on
 * the lease's `gates`, not the corpus. An unleased fail still clears the
 * stamp — the downshift retracts the readiness claim the stamp records.
 */
function failEdits(
  fm: Record<string, unknown>,
  gap: string,
  opts: { leased: boolean } = { leased: false },
): FieldEdit[] {
  const edits: FieldEdit[] = []
  const currentState = fm['state']
  const midFlight =
    opts.leased || (typeof currentState === 'string' && IN_PROGRESS_STATES.has(currentState))
  if (!midFlight) {
    edits.push({ Set: { key: 'state', value: DOWNSHIFT_STATE } })
  }
  if (!opts.leased && 'readiness_verified_at' in fm) {
    edits.push({ Remove: { key: 'readiness_verified_at' } })
  }
  edits.push({ Set: { key: 'definition_gap', value: gap } })
  return edits
}

// ---------------------------------------------------------------------------
// Frontmatter/base validation — in-process, via the `entities validate` op's
// own handler (never a subprocess: see the module header). `callSync` is
// `@lib/registry`'s shared helper: `entities validate`'s own handler has no
// `await` in it and always returns a plain object, but this runs from inside
// a SYNC `commitToMainViaWorktree` `mutate` callback below, which cannot
// itself be async.
// ---------------------------------------------------------------------------

/**
 * Validate `path`'s frontmatter in-process and, on failure, write the FAIL
 * diagnostics to `io.stderr` in the same shape the CLI's own text projection
 * (`renderFrontmatter` in `lib/model/ops/validate.ts`) uses. Returns whether
 * the file passed.
 */
function validateOrRefuse(io: CliIo, path: string): boolean {
  const result = callSync(
    validateOp.handler(
      { flavor: 'frontmatter', files: [path], schema: null, entitiesDir: null, quiet: false },
      createCtx({ projectRoot: dirname(path) }),
    ),
  )
  if (result.failed === 0) return true
  for (const r of result.results) {
    if (r.parseError !== null) {
      io.stderr(`FAIL ${r.path}\n  ${r.parseError}\n`)
    } else if (r.errors.length > 0) {
      io.stderr(`FAIL ${r.path}  (schema: ${r.schema})\n`)
      for (const line of r.errors) io.stderr(line + '\n')
    }
  }
  io.stderr(`${result.failed}/${result.total} file(s) failed validation\n`)
  return false
}

function nowIsoUtc(): string {
  // strftime("%Y-%m-%dT%H:%M:%SZ") on the current UTC time.
  const d = new Date()
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}Z`
  )
}

// Subject shapes single-sourced by the task-lifecycle commit kind
// (lib/model/entities/task/commits/lifecycle/template.eta).
//
// A pass that commits is always the promotion commit. That includes the
// gap-clearing pass on a task already at `open/ready`: `definition_gap` is the
// needs-definition marker, so clearing it IS the readiness claim landing on
// main, even when `state` was already there (the lease carve-out can leave a
// gap on an `open/ready` task).
function commitSubject(
  mode: string,
  basename: string,
  gapSummary: string | null,
): [string, string] {
  if (mode === 'pass') {
    const msg = renderTaskLifecycleCommit({ action: 'promote-ready', basename })
    return [msg.subject, msg.body]
  }
  let oneLine = gapSummary ? (gapSummary.split('\n')[0] ?? '') : ''
  oneLine = oneLine.trim()
  const msg = renderTaskLifecycleCommit({
    action: 'flag-needs-definition',
    basename,
    ...(oneLine === '' ? {} : { detail: oneLine }),
  })
  return [msg.subject, msg.body]
}

/**
 * Validate, stage, and commit `path` in `repo`. Returns `EXIT.ok` on success,
 * `EXIT_WRITE_REFUSED` on failure with stderr messages already emitted.
 */
function commitIn(io: CliIo, repo: string, path: string, subject: string, body: string): number {
  if (!validateOrRefuse(io, path)) {
    io.stderr(`validator rejected ${path}; refusing to commit\n`)
    return EXIT_WRITE_REFUSED
  }

  // Regenerate the generated-docs artifacts this frontmatter change derives
  // and stage them alongside the task file, so the verify / needs-definition
  // commit carries its own derived pages and passes the docs-drift gate
  // without --no-verify ([[T-PA51-task-state-commits-regen-site-page]]).
  const regenerated = regenerateAndListChanged(repo)
  const git = new Git(repo)

  // `try` throughout: every git failure on this path is reported as
  // EXIT_WRITE_REFUSED, which is the documented contract, so a bare
  // `CommandFailed` must not escape.
  const added = git.try.add([path, ...regenerated])
  if (!added.ok) {
    io.stderr(`${added.error.detail}\n`)
    return EXIT_WRITE_REFUSED
  }

  // An unreadable index is NOT "nothing staged": folding it into the
  // idempotent no-op below would report a commit that never happened as done.
  const stagedRes = git.try.diffNameOnly({ cached: true })
  if (!stagedRes.ok) {
    io.stderr(`${stagedRes.error.detail}\n`)
    return EXIT_WRITE_REFUSED
  }
  const staged = stagedRes.value
  const rel = relativeTo(path, repo)
  const expected = rel ?? path
  if (staged.length === 0) {
    return EXIT.ok // idempotent no-op
  }
  const unexpected = staged.filter((p) => p !== expected && !isGeneratedDocsPath(p))
  if (!staged.includes(expected) || unexpected.length > 0) {
    io.stderr(
      'unexpected staged changes — refusing to commit. ' +
        `staged: ${repr(staged)}, expected the task file ` +
        `(${repr(expected)}) plus only generated-docs paths\n`,
    )
    return EXIT_WRITE_REFUSED
  }

  let msg = subject
  if (body) {
    msg += '\n\n' + body
  }
  if (!(subject + body).endsWith('\n')) {
    msg += '\n'
  }
  const committed: GitOutcome<void> = git.try.commit({ messageStdin: msg })
  if (!committed.ok) {
    io.stderr(`${committed.error.detail}\n`)
    return EXIT_WRITE_REFUSED
  }
  return EXIT.ok
}

/** Return `path` relative to `repo`, or null if `path` isn't under `repo`. */
function relativeTo(path: string, repo: string): string | null {
  const p = resolve(path)
  const r = resolve(repo)
  if (p === r) return ''
  const prefix = r.endsWith('/') ? r : r + '/'
  if (p.startsWith(prefix)) return p.slice(prefix.length)
  return null
}

// ---------------------------------------------------------------------------
// Uncommitted-body-edits precondition
//
// The readiness gate stamps `readiness_verified_at:` into the frontmatter and
// commits ONLY the stamp. If the task file already carries uncommitted *body*
// edits when the gate runs, `git add <task-file>` would sweep those edits into
// the stamp commit — and /sdlc:task-work's Step 5b then sees a single commit
// touching both frontmatter (conflicting with the start-commit's frontmatter
// edit) and body, forcing a manual rebase conflict on what should be a green
// path. The gate refuses to bundle: it inspects the file's pre-mutation
// working-tree diff against HEAD and bails if any hunk lands in the body.
// See [[T-XBJY-ensure-ready-refuses-with-unstaged-body-edits]].
// ---------------------------------------------------------------------------

/**
 * Line number (1-based) of the closing `---` frontmatter delimiter in `text`,
 * or null if `text` has no `---\n...\n---` block at the top. Lines at or below
 * the opening `---` and up to and including the closing `---` are frontmatter;
 * everything strictly after the closing delimiter is body.
 */
function frontmatterCloseLine(text: string): number | null {
  const lines = text.split('\n')
  if (lines[0] !== '---') return null
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') return i + 1 // 1-based line number
  }
  return null
}

/** A new-side hunk range parsed from a unified-diff `@@` header. */
interface HunkRange {
  start: number // 1-based first changed line on the new side
  count: number // number of new-side lines in the hunk
}

/**
 * Parse the new-side `+start,count` ranges out of a unified diff. A header
 * with no count (`+start`) means a single line. A header with `+start,0`
 * (pure deletion) anchors at `start` with zero added lines — we still record
 * it so a body-only deletion is caught.
 */
function parseNewSideHunks(diff: string): HunkRange[] {
  const out: HunkRange[] = []
  const re = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/
  for (const line of diff.split('\n')) {
    const m = re.exec(line)
    if (!m) continue
    const start = Number(m[1])
    const count = m[2] === undefined ? 1 : Number(m[2])
    out.push({ start, count })
  }
  return out
}

/**
 * Inspect `relPath`'s uncommitted diff (staged + unstaged) against HEAD in
 * `repo`. Returns the list of hunk ranges that touch body lines — i.e. any
 * hunk whose new-side range reaches a line strictly after the frontmatter's
 * closing `---`. An empty list means the only pending changes (if any) are
 * confined to the frontmatter block, which is safe to bundle with the stamp.
 *
 * `fmCloseLine` is the 1-based closing-delimiter line of the file's CURRENT
 * working-tree content (computed before the mutator writes the stamp).
 *
 * A pure deletion needs its own arm. git anchors one at the new-side line
 * BEFORE the removed text — deleting the line right after the frontmatter
 * renders as `@@ -5 +4,0 @@` for a block closing at line 4 — so comparing its
 * `start` against `fmCloseLine` reads `4 > 4` and waves through the very
 * shape the guard exists to catch. What the deletion removed sits at
 * `start + 1`, so that is what is compared.
 *
 * `rawChecked` because no verb renders a unified diff, and CHECKED because a
 * diff that could not be read is not "no body edits" — a guard that cannot
 * look must refuse, not wave the commit through. The caller turns the throw
 * into the same EXIT_WRITE_REFUSED refusal.
 */
/**
 * The last new-side line a hunk touches. A pure deletion (`count === 0`) is
 * anchored one line before what it removed, so the line at issue is the next
 * one.
 */
function lastTouchedLine(h: HunkRange): number {
  return h.count > 0 ? h.start + h.count - 1 : h.start + 1
}

function bodyEditHunks(repo: string, relPath: string, fmCloseLine: number): HunkRange[] {
  const git = new Git(repo)
  const collect = (cached: boolean): HunkRange[] => {
    const argv = ['diff']
    if (cached) argv.push('--cached')
    argv.push('--unified=0', '--', relPath)
    return parseNewSideHunks(git.rawChecked(argv).stdout)
  }
  const all = [...collect(false), ...collect(true)]
  return all.filter((h) => lastTouchedLine(h) > fmCloseLine)
}

/**
 * Refuse the stamp commit when `path` (relative `relPath` inside `repo`) has
 * uncommitted body edits. Returns `EXIT.ok` to proceed, or
 * `EXIT_WRITE_REFUSED` after emitting a clear, file-and-hunk-named error on
 * stderr.
 * Must be called BEFORE the mutator writes the frontmatter stamp, so the diff
 * reflects only the author's pre-existing edits, not the stamp itself.
 */
function refuseOnBodyEdits(io: CliIo, repo: string, path: string, relPath: string): number {
  let text: string
  try {
    text = readFileSync(path, 'utf-8')
  } catch {
    return EXIT.ok // file unreadable here; downstream isFile/commit checks handle it
  }
  const fmClose = frontmatterCloseLine(text)
  if (fmClose === null) return EXIT.ok // no frontmatter block: nothing to protect
  let bodyHunks: HunkRange[]
  try {
    bodyHunks = bodyEditHunks(repo, relPath, fmClose)
  } catch (e) {
    if (!(e instanceof CommandFailed)) throw e
    io.stderr(
      `could not read ${relPath}'s pending diff in ${repo}; refusing to ` +
        `commit: ${e.message}\n`,
    )
    return EXIT_WRITE_REFUSED
  }
  if (bodyHunks.length === 0) return EXIT.ok
  const ranges = bodyHunks
    .map((h) => {
      if (h.count === 0) return `${h.start + 1} (deleted)`
      return h.count === 1 ? `${h.start}` : `${h.start}-${h.start + h.count - 1}`
    })
    .join(', ')
  io.stderr(
    `${relPath} has uncommitted body edits (hunks touching lines ${ranges}, ` +
      `past the frontmatter block which closes at line ${fmClose}). ` +
      `Commit body edits in a separate commit before invoking the readiness ` +
      `gate — the gate must be the only thing in the stamp commit. ` +
      `Stage and commit the body edits, then re-run.\n`,
  )
  return EXIT_WRITE_REFUSED
}

/**
 * The pass marker block. `readiness_verified_at` is the stamp THIS invocation
 * recorded — on frontmatter for a promotion, on the lease's `gates` for a
 * leased run — or `-` when it recorded none (the already-`open/ready` no-op,
 * which deliberately does not refresh the stamp). `plane` names where the
 * verdict landed so the caller never has to infer it from the stamp line.
 */
function emitPassMarker(io: CliIo, basename: string, stampIso: string | null, plane: Plane): void {
  io.stdout(`ENSURE-READY-OK: ${basename}\n`)
  io.stdout(`readiness_verified_at: ${stampIso ?? '-'}\n`)
  io.stdout(`plane: ${plane}\n`)
}

/**
 * The `--commit` refusal marker. Standalone `--commit` writes the task file on
 * the CURRENT checkout and branch — exactly the write a live run must never
 * take ([[D-S30G-task-state-plane-split]]) — so a held lease refuses instead of
 * committing. Its own exit code (12, `LEASE_CONFLICT`), distinct from the
 * usage/state/commit codes, so a caller can branch on it.
 */
function emitLeasedMarker(io: CliIo, basename: string, phase: string): void {
  io.stdout(`ENSURE-READY-LEASED: ${basename}\n`)
  io.stderr(
    `refusing --commit: task ${basename} holds an active lease ` +
      `(phase=${phase}). Re-run with --commit-on main (the leased pass writes ` +
      `lease gates and commits nothing), or release the lease first.\n`,
  )
}

function emitFailMarker(io: CliIo, basename: string, gap: string): void {
  let oneLine = gap ? (gap.split('\n')[0] ?? '') : ''
  oneLine = oneLine.trim()
  io.stdout(`ENSURE-READY-NEEDS-DEFINITION: ${basename}\n`)
  io.stdout(`definition_gap: ${oneLine}\n`)
}

// ---------------------------------------------------------------------------
// Lease plane — discovery is READ-ONLY and degrades to "no lease".
//
// An unconfigured authority, an absent ref, an unreachable network, or a
// payload that fails schema validation all mean the same thing to this gate:
// no active lease, carry on with the frontmatter plane. The gate must never
// crash on lease infrastructure — a readiness verdict is not worth a hard
// failure, and the corpus-plane behavior is safe by construction.
// ---------------------------------------------------------------------------

interface ActiveLease {
  authority: string
  lease: TaskLifecycleLease
}

/**
 * Is this lease still held? `awaiting-review` and `blocked` are the
 * NON_EXPIRING_PHASES — a lease parked there carries `expires_at: null` and is
 * held until someone acts. Every other phase is held until its expiry passes.
 */
function leaseIsActive(lease: TaskLifecycleLease, now: Date): boolean {
  if (NON_EXPIRING_PHASES.has(lease.phase)) return true
  if (lease.expires_at === null) return true
  const expiry = Date.parse(lease.expires_at)
  return Number.isFinite(expiry) && expiry > now.getTime()
}

function discoverActiveLease(io: CliIo, projectRoot: string, taskId: string): ActiveLease | null {
  let authority: string
  try {
    authority = resolveAuthority({ projectRoot })
  } catch {
    return null // no authority configured — this project does not lease
  }
  let lease: TaskLifecycleLease
  try {
    lease = fetchLease(taskId, { cwd: projectRoot, authority }).lease
  } catch (e) {
    if (!(e instanceof LeaseError)) {
      // Not a protocol failure (a spawn problem, say). Say so once, then
      // degrade — the verdict still has to land.
      io.stderr(
        `lease read failed for ${taskId}; treating as unleased: ` +
          `${e instanceof Error ? e.message : String(e)}\n`,
      )
    }
    return null // RefNotFound / network / schema drift
  }
  return leaseIsActive(lease, new Date()) ? { authority, lease } : null
}

/** Remove `<mainRepo>/.sdlc/worktrees/<basename>`. */
function cleanupWorktree(io: CliIo, mainRepo: string, basename: string): string {
  const worktreePath = worktreeDir(mainRepo, basename)
  if (!existsSync(worktreePath)) return 'absent'
  // `try`: teardown reports its outcome as a status string rather than
  // throwing, and a worktree git refuses to remove is `remove-failed`, not a
  // crash. The directory on disk — not the exit code — is the verdict, since
  // a partial removal can succeed on disk and still exit non-zero.
  const removed = new Git(mainRepo).try.worktreeRemove(worktreePath, { force: true })
  if (!existsSync(worktreePath)) return 'removed'
  if (!removed.ok) io.stderr(`${removed.error.detail}\n`)
  return 'remove-failed'
}

/** Delete `task/<basename>` (and the legacy `feat/<basename>`). */
function cleanupBranch(io: CliIo, mainRepo: string, basename: string): string {
  const git = new Git(mainRepo)
  let deletedAny = false
  for (const prefix of ['task', 'feat']) {
    const branch = `${prefix}/${basename}`
    if (!git.branchExists(branch)) continue
    // `try`: one undeletable branch must not abort the other prefix, and the
    // function answers with a status string.
    const deleted = git.try.deleteBranch(branch, { force: true })
    if (deleted.ok) {
      deletedAny = true
    } else {
      io.stderr(`${deleted.error.detail}\n`)
    }
  }
  return deletedAny ? 'deleted' : 'absent'
}

/** Release `refs/sdlc/tasks/<basename>`, in-process via the `lease release` op. */
function cleanupLease(io: CliIo, mainRepo: string, basename: string): string {
  // Same resolver the gate uses (discoverActiveLease): reading sdlc.yaml
  // directly here would miss SDLC_LEASE_AUTHORITY and skip releasing a lease
  // the gate had just deferred to.
  try {
    resolveAuthority({ projectRoot: mainRepo })
  } catch {
    return 'unconfigured' // this project does not lease
  }
  const ref = `refs/sdlc/tasks/${basename}`
  try {
    releaseOp.handler({ ref }, createCtx({ projectRoot: mainRepo }))
    return 'released'
  } catch (e) {
    // Read from the taxonomy rather than written down: the number moved once
    // already, and a stale literal here silently reports a failed release as
    // "already released".
    if (e instanceof OpError && e.code === 'REF_NOT_FOUND') return 'absent'
    // An OpError may carry a verbatim failure marker (the lease protocol's
    // `CAS-FAILED ref=…`/`REF-NOT-FOUND ref=…` lines) — relay it byte-exactly,
    // matching what the CLI adapter would have printed for the same failure.
    const marker = e instanceof OpError ? e.marker : undefined
    if (marker !== undefined) {
      io.stderr(`${marker}\n`)
    } else {
      io.stderr(`error: ${e instanceof Error ? e.message : String(e)}\n`)
    }
    return 'release-failed'
  }
}

/** What a frontmatter-plane mutation actually did. */
interface MutationOutcome {
  /** The file was rewritten. False means it is byte-identical to before. */
  changed: boolean
  /** The stamp written to frontmatter, or null when none was. */
  stamp: string | null
}

function applyMutation(
  io: CliIo,
  path: string,
  mode: string,
  gap: string | null,
  now: string,
  opts: { leased: boolean } = { leased: false },
): MutationOutcome {
  const text = readFileSync(path, 'utf-8')
  // `parseFrontmatterResult` rather than `parseFrontmatter`: it carries the
  // mapping guard (a list frontmatter would otherwise slip through) AND the
  // yaml library's line/column diagnostic on malformed input, so three
  // distinct failures stay distinct rather than collapsing into one message.
  const { fm, parseError } = parseFrontmatterResult(text)
  if (fm === null) {
    io.stderr(`${parseError} in ${path}\n`)
    throw new ExitError(EXIT.error)
  }
  const state = fm['state']
  if (typeof state !== 'string' || !ALLOWED_INPUT_STATES.has(state)) {
    const sorted = Array.from(ALLOWED_INPUT_STATES).sort()
    io.stderr(
      `state ${repr(state)} in ${path} is not an accepted ` +
        `ensure-ready input (allowed: ${repr(sorted)})\n`,
    )
    throw new ExitError(EXIT_UNACCEPTABLE_STATE)
  }
  let edits: FieldEdit[]
  let stamp: string | null = null
  if (mode === 'pass') {
    const plan = planPassEdits(fm, now)
    edits = plan.edits
    stamp = plan.stamp
  } else {
    edits = failEdits(fm, gap as string, { leased: opts.leased })
  }
  // An empty batch is the already-`open/ready`-and-clean pass: no write at all,
  // so the file stays byte-identical.
  if (edits.length === 0) return { changed: false, stamp: null }

  const result = editFrontmatterFields(text, edits)
  if (result === null) {
    io.stderr(`no YAML frontmatter block found in ${path}\n`)
    throw new ExitError(EXIT.error)
  }
  if (!result.changed) return { changed: false, stamp }
  writeFileSync(path, result.text, 'utf-8')
  return { changed: true, stamp }
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const cli = defineCli({
  name: 'sdlc task ensure-ready-mutate',
  summary: "Apply the readiness gate's verdict, on whichever plane owns the fact.",
  flags: {
    mode: {
      kind: 'enum',
      valueName: 'verdict',
      choices: ['pass', 'fail'] as const,
      required: true,
      help: 'The gate verdict to apply.',
    },
    gap: {
      kind: 'string',
      valueName: 'text',
      help: 'The definition gap to record. Required with --mode fail.',
    },
    now: {
      kind: 'string',
      valueName: 'iso',
      help: 'The readiness_verified_at stamp. Default: now, UTC.',
    },
    commit: { kind: 'boolean', help: 'Commit on the CURRENT checkout and branch.' },
    commitOn: {
      kind: 'string',
      valueName: 'branch',
      help: 'Commit to this branch (pass the state branch: `sdlc orchestrate target`) through a worktree off its tip.',
    },
    cleanupOnFail: {
      kind: 'boolean',
      help: 'After a downshift commit lands, tear down the worktree, branch and lease.',
    },
  },
  positionals: [{ name: 'task-file', required: true, help: 'The task markdown to act on.' }],
})

function exists(path: string): boolean {
  return existsSync(path)
}

// ---------------------------------------------------------------------------
// applyVerdict, split into named stages ([[T-IL6K]]): argument parsing, the
// two top-level dispatch branches (--commit-on's worktree-mediated commit to
// main, and the default/--commit path acting on the file as-given), and the
// smaller pieces each of those branches is built from.
// ---------------------------------------------------------------------------

/** Parse and validate `applyVerdict`'s argv. Never throws; every failure is an exit code. */
function parseVerdictArgs(argv: readonly string[], io: CliIo) {
  const parsed = cli.parse(argv, io)
  if (parsed.status === 'help') return { exit: EXIT.ok }
  if (parsed.status === 'error') {
    io.stderr(`${parsed.message}\n`)
    return { exit: EXIT.usage }
  }
  const args = {
    ...parsed.values,
    gap: parsed.values.gap ?? null,
    now: parsed.values.now ?? null,
    commitOn: parsed.values.commitOn ?? null,
  }
  const path = parsed.positionals[0] as string

  if (args.commit && args.commitOn) {
    io.stderr('--commit and --commit-on are mutually exclusive\n')
    return { exit: EXIT.usage }
  }

  if (args.mode === 'fail' && (args.gap === null || !args.gap.trim())) {
    io.stderr('--gap is required for --mode fail\n')
    return { exit: EXIT.usage }
  }

  if (args.cleanupOnFail && args.mode !== 'fail') {
    io.stderr('--cleanup-on-fail is only meaningful with --mode fail\n')
    return { exit: EXIT.usage }
  }

  if (args.cleanupOnFail && !(args.commit || args.commitOn)) {
    io.stderr(
      '--cleanup-on-fail requires --commit or --commit-on ' +
        '(the teardown only fires after the downshift commit lands)\n',
    )
    return { exit: EXIT.usage }
  }

  return { args, path }
}

/** The parsed-and-validated argument shape `parseVerdictArgs` produces on success. */
type VerdictArgs = Extract<ReturnType<typeof parseVerdictArgs>, { path: string }>['args']

/**
 * Leased pass: write the EXECUTION plane's `gates` field only. Zero commits
 * land on main, and the task file itself is not touched.
 */
function applyLeasedPass(
  io: CliIo,
  basename: string,
  now: string,
  projectRoot: string,
  held: ActiveLease,
): number {
  try {
    updateLeaseGates(
      basename,
      { readinessVerifiedAt: now },
      { cwd: projectRoot, authority: held.authority },
    )
  } catch (e) {
    io.stderr(
      `lease gates write failed for ${basename}: ` +
        `${e instanceof Error ? e.message : String(e)}\n`,
    )
    return EXIT_WRITE_REFUSED
  }
  emitPassMarker(io, basename, now, 'lease-gates')
  return EXIT.ok
}

/**
 * Unleased pass: decide off origin/<target>'s copy — the tree the commit will be
 * built on — so the no-op case never spins up a worktree at all. An `exit` in
 * the result means the whole command is already resolved (not-found, or the
 * already-`open/ready`-and-clean no-op); otherwise `stamp` is what the
 * eventual worktree commit should write.
 */
async function planUnleasedPass(
  io: CliIo,
  git: ReturnType<typeof spawnRunner>,
  projectRoot: string,
  basename: string,
  now: string,
  target: string,
): Promise<{ exit: number } | { stamp: string | null }> {
  // Best-effort: an offline or misconfigured remote leaves the local
  // `origin/<target>` where it was, and the `readTask` below then decides off
  // that ref — a stale read is recoverable, a crashed gate is not.
  new Git(projectRoot, { runner: git }).try.fetch('origin', target, { quiet: true })
  const originRead = readTask(basename, { projectRoot, at: `origin/${target}`, git })
  if (originRead === null || originRead.fm === null) {
    io.stderr(`task file not found on origin/${target}: ${basename}.md\n`)
    return { exit: EXIT.error }
  }
  const plan = planPassEdits(originRead.fm, now)
  if (plan.edits.length === 0) {
    // Already `open/ready` and clean: the readiness claim is already on the target
    // and the stamp is never refreshed. No commit, no write.
    emitPassMarker(io, basename, null, 'none')
    return { exit: EXIT.ok }
  }
  return { stamp: plan.stamp }
}

/**
 * Build and land the promotion / needs-definition commit through an
 * ephemeral worktree off origin/<target>, then emit the terminal marker (and, on
 * a `--cleanup-on-fail` downshift, tear down the worktree/branch/lease).
 */
async function commitVerdictToMain(
  io: CliIo,
  git: ReturnType<typeof spawnRunner>,
  start: string,
  basename: string,
  args: VerdictArgs,
  now: string,
  held: ActiveLease | null,
  passStamp: string | null,
  target: string,
): Promise<number> {
  let result
  try {
    result = await commitToMainViaWorktree({
      projectRoot: start,
      git,
      label: basename,
      branch: target,
      mutate: (wt) => {
        const wtTaskPath = resolve(join(wt, 'docs', 'planning', 'tasks', `${basename}.md`))
        if (!isFile(wtTaskPath)) {
          io.stderr(`task file not found on origin/${target}: ${basename}.md\n`)
          throw new ExitError(EXIT.error)
        }
        // Re-plan against the clean off-origin tree so a push-race retry
        // re-applies identically (pass: promotion / gap clear; fail:
        // downshift + definition_gap), then validate before it commits.
        const outcome = applyMutation(io, wtTaskPath, args.mode, args.gap, now, {
          leased: held !== null,
        })
        // The pass arm decided up front (off this same tree) that an edit was
        // due, so "no change" here means origin/<target> moved underneath. The
        // fail arm always has a gap to write, so a re-fail with an
        // identical gap still surfaces as the empty commit git refuses.
        if (args.mode === 'pass' && !outcome.changed) {
          io.stderr(
            `nothing to commit for ${basename}: origin/${target} moved under the ` +
              `readiness gate. Re-run.\n`,
          )
          throw new ExitError(EXIT_WRITE_REFUSED)
        }
        if (!validateOrRefuse(io, wtTaskPath)) {
          io.stderr(`validator rejected ${wtTaskPath}; refusing to commit\n`)
          throw new ExitError(EXIT_WRITE_REFUSED)
        }
        const [subject, body] = commitSubject(args.mode, basename, args.gap)
        const rel = relativeTo(wtTaskPath, wt) ?? wtTaskPath
        const message = body ? `${subject}\n\n${body}` : subject
        return { stagePaths: [rel], message }
      },
    })
  } catch (e) {
    if (e instanceof CommitToMainError) {
      io.stderr(`${e.message}\n`)
      return EXIT_WRITE_REFUSED
    }
    throw e
  }

  if (args.mode === 'pass') {
    // The stamp rides the promotion commit; a gap-clearing pass on an
    // already-promoted task writes no stamp.
    emitPassMarker(io, basename, passStamp, 'frontmatter-promotion')
  } else {
    emitFailMarker(io, basename, args.gap ?? '')
    if (args.cleanupOnFail) {
      const wtState = cleanupWorktree(io, result.mainCheckout, basename)
      const brState = cleanupBranch(io, result.mainCheckout, basename)
      const leaseState = cleanupLease(io, result.mainCheckout, basename)
      io.stdout(`cleaned-up: worktree=${wtState} ` + `branch=${brState} lease=${leaseState}\n`)
    }
  }
  return EXIT.ok
}

/**
 * The `--commit-on` branch: the promotion / needs-definition commit lands on
 * origin/<target> through an ephemeral worktree off origin/<target> — NEVER the
 * primary checkout ([[D-WK7T-agent-git-writes-worktree-isolated]]). The
 * off-origin tree is clean, so the body-edit precondition does not apply: the
 * author's body edits stay in their own task worktree, untouched.
 */
async function applyVerdictOnMain(
  io: CliIo,
  args: VerdictArgs,
  basename: string,
  start: string,
  projectRoot: string,
  now: string,
  activeLease: () => ActiveLease | null,
  target: string,
): Promise<number> {
  // The runner both the entity read layer's `at:` seam and the
  // commit-to-main worktree primitive take.
  const git = spawnRunner('git')
  const held = activeLease()

  // A leased pass writes the EXECUTION plane and nothing else: the run's gate
  // result goes on the lease's `gates`, zero commits land on main, and the
  // task file is not touched.
  if (args.mode === 'pass' && held !== null) {
    return applyLeasedPass(io, basename, now, projectRoot, held)
  }

  let passStamp: string | null = null
  if (args.mode === 'pass') {
    const outcome = await planUnleasedPass(io, git, projectRoot, basename, now, target)
    if ('exit' in outcome) return outcome.exit
    passStamp = outcome.stamp
  }

  return await commitVerdictToMain(io, git, start, basename, args, now, held, passStamp, target)
}

/**
 * Default / `--commit` path: act on the file as-given (the current checkout
 * and branch), rather than routing through a worktree off origin/<target>.
 */
function applyVerdictOnCurrentCheckout(
  io: CliIo,
  args: VerdictArgs,
  path: string,
  basename: string,
  now: string,
  activeLease: () => ActiveLease | null,
): number {
  if (!isFile(path)) {
    io.stderr(`task file not found: ${path}\n`)
    return EXIT.error
  }

  if (args.commit) {
    // Standalone --commit writes the CURRENT checkout and branch. A live run
    // owns that tree, so refuse rather than commit under it.
    const held = activeLease()
    if (held !== null) {
      emitLeasedMarker(io, basename, held.lease.phase)
      return exitCodeFor('LEASE_CONFLICT')
    }

    // `topLevel()` answers `null` outside a repo rather than throwing, which
    // is the one case this branch has to report as EXIT_WRITE_REFUSED.
    const repo = new Git(dirname(path)).topLevel()
    if (repo === null) {
      io.stderr(`not a git repository: ${dirname(path)}\n`)
      return EXIT_WRITE_REFUSED
    }

    // Refuse before mutating if the task file already carries uncommitted
    // body edits — the gate must not bundle them into its commit.
    const rel = relativeTo(path, repo) ?? path
    const bodyRc = refuseOnBodyEdits(io, repo, path, rel)
    if (bodyRc !== EXIT.ok) return bodyRc

    const outcome = applyMutation(io, path, args.mode, args.gap, now, { leased: false })
    if (args.mode === 'pass' && !outcome.changed) {
      // Already `open/ready` and clean — nothing to commit, file untouched.
      emitPassMarker(io, basename, null, 'none')
      return EXIT.ok
    }

    const [subject, body] = commitSubject(args.mode, basename, args.gap)
    const rc = commitIn(io, repo, path, subject, body)
    if (rc !== 0) return rc

    if (args.mode === 'pass') {
      emitPassMarker(io, basename, outcome.stamp, 'frontmatter-promotion')
    } else {
      emitFailMarker(io, basename, args.gap ?? '')
    }
    return EXIT.ok
  }

  // No-commit path: the caller owns the commit boundary, so the
  // body-edits precondition does not apply — just write the mutation. The fail
  // carve-out still consults the lease: a live run must not be downshifted even
  // when someone else will make the commit.
  applyMutation(io, path, args.mode, args.gap, now, {
    leased: args.mode === 'fail' && activeLease() !== null,
  })

  return EXIT.ok
}

async function applyVerdict(
  argv: readonly string[],
  ctx: CliContext,
  target: string,
): Promise<number> {
  const io = ctx.io
  const parsed = parseVerdictArgs(argv, io)
  if ('exit' in parsed) return parsed.exit
  const { args, path } = parsed

  const now = args.now || nowIsoUtc()
  const basename = pathStem(path)
  const start = exists(path) ? dirname(path) : ctx.cwd
  // Outside a repo there is no primary checkout to find; `start` itself is the
  // closest thing, and every git-touching path below then fails on its own.
  const projectRoot = mainCheckoutFrom(start) ?? resolve(start)

  // Lease discovery is one authority round-trip; only the paths that branch on
  // it pay for it.
  let leaseProbed = false
  let leaseCache: ActiveLease | null = null
  const activeLease = (): ActiveLease | null => {
    if (!leaseProbed) {
      leaseProbed = true
      leaseCache = discoverActiveLease(io, projectRoot, basename)
    }
    return leaseCache
  }

  if (args.commitOn) {
    // An explicit `--commit-on <branch>` wins; the resolved state branch is only
    // the fallback for an empty value.
    const commitTarget = args.commitOn.trim() === '' ? target : args.commitOn
    return await applyVerdictOnMain(
      io,
      args,
      basename,
      start,
      projectRoot,
      now,
      activeLease,
      commitTarget,
    )
  }

  return applyVerdictOnCurrentCheckout(io, args, path, basename, now, activeLease)
}

/** Python pathlib `.stem`: filename without the final extension. */
function pathStem(path: string): string {
  const name = pathBasename(path)
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return name
  return name.slice(0, dot)
}

/**
 * `ExitError` is how the deep mutation path reports an exit code from inside a
 * `commitToMainViaWorktree` callback, which has nowhere to return one to. It
 * is caught here so `main` still only ever returns — [[S-0015-standalone-cli-shape]]
 * rule 1.
 */
export async function main(
  argv: readonly string[],
  ctx: CliContext,
  target = 'main',
): Promise<number> {
  try {
    return await applyVerdict(argv, ctx, target)
  } catch (err) {
    if (err instanceof ExitError) return err.code
    throw err
  }
}

export { planPassEdits, failEdits }

// ---------------------------------------------------------------------------
// Op definition — CliHints.rawArgv (see lib/registry.ts): this op's whole CLI
// surface (flags, error text, exit codes) is `main`, above, unchanged from the
// retired standalone script.
// ---------------------------------------------------------------------------

const input = z.object({ argv: z.array(z.string()) })
const output = z.object({ exitCode: z.number().int() })

export default defineOp({
  path: ['task', 'ensure-ready-mutate'],
  summary: "Apply the readiness gate's verdict, on whichever plane owns the fact.",
  hidden: true,
  input,
  output,
  cli: { rawArgv: true },
  handler: async ({ argv }, ctx: OpCtx) => ({
    exitCode: await main(argv, legacyCliContext(ctx), stateBranch(ctx)),
  }),
})
