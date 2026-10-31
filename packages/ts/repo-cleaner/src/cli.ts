/**
 * `repo-cleaner` — what has been merged, and what can go away.
 *
 * Four verbs over one set of sweep filters:
 *
 *   status  (the default) inventory and classify; read-only but for the fetch
 *   summary the same sweep as counts: totals, merged, delete, prune, review, keep
 *   plan    write the deletable rows as a plan, to stdout or a file
 *   apply   re-check, show the steps, ask, then delete
 *
 * `apply` works from a saved plan (`--plan`) or sweeps first. Either way it
 * re-checks every row, prints the steps it would run and asks before deleting;
 * `--yes` skips the question. Without a terminal and without `--yes` it
 * refuses rather than deleting. Scope is opt-in: the sweep covers the
 * repository you are standing in unless a path says otherwise.
 *
 * Exit codes:
 *   0   swept; or apply ran, was declined, or had nothing to run
 *   1   failed against the state it found
 *   2   cannot run as typed
 *   10  nothing to sweep: no entry named a repository
 *   11  apply stopped at a failed step; the receipt says which
 */

import { existsSync, readSync, realpathSync } from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { isatty } from 'node:tty'

import { EXIT, askYesNo, canPrompt, defineCli, systemDirs, type CliContext } from '@osdlc/cli-tool'
import { Git } from '@osdlc/typed-git'
import { detectColorLevel } from '@osdlc/ux'

import { resolveBranch } from './branches.ts'
import { VENDOR_DIRS } from './devlink.ts'
import { ensureMirror, mirrorProblem } from './remote-mirror.ts'
import { ApplyArgumentError, applyPlan, parseGrant, parseRowRef, type Grant } from './apply.ts'
import {
  PLAN_VERSION,
  fileStamp,
  parsePlan,
  planRepo,
  readPlan,
  writePlan,
  type Plan,
} from './plan.ts'
import { RECEIPT_VERSION, type Receipt, type RowRef, type Step } from './receipt.ts'
import {
  PLAIN,
  proposedCommands,
  renderCountsJson,
  renderCountsText,
  renderJson,
  renderPreview,
  renderPreviewDrops,
  renderReceipt,
  renderStepDone,
  renderSummary,
  renderText,
  rowsActedOn,
  summarizeReceipt,
  TERMINAL_STYLE,
  type Style,
} from './render.ts'
import {
  NO_STATUS_LINE,
  describeStep,
  describeSweep,
  statusLine,
  type StatusLine,
} from './status-line.ts'
import { stepBoard, type StepBoard } from './step-board.ts'
import { sweepRepos, type SweepReposOptions } from './sweep.ts'
import type { Scope, SweepItem, SweepProgress, SweepResult } from './types.ts'

const EXIT_NOTHING_TO_SWEEP = 10
const EXIT_STEP_FAILED = 11

const NAME = 'repo-cleaner'

/** The `--only` names, and the sweep scope each selects. */
const ONLY: Record<string, Scope> = {
  worktrees: 'worktrees',
  branches: 'local-branches',
  remotes: 'remote-branches',
}

/** The flags every verb that sweeps takes. */
const SWEEP_FLAGS = {
  only: {
    kind: 'list',
    valueName: 'list',
    help: `comma-separated: ${Object.keys(ONLY).join(', ')} (default: worktrees, branches; remotes with --remotes)`,
  },
  remotes: {
    kind: 'boolean',
    help: 'also sweep remote branches, which is slower: each one is compared with the default branch',
  },
  branch: {
    kind: 'string',
    valueName: 'name|HEAD',
    help: 'only this branch of this repository: its worktree and local branch, and its remote branch with --remotes',
  },
  remote: {
    kind: 'string',
    valueName: 'name',
    help: 'remote to measure against (default: origin)',
  },
  remoteUrl: {
    kind: 'list',
    valueName: 'url',
    default: [],
    commaSeparated: false,
    help: 'sweep the branches of this remote with no checkout of your own, through a clone kept in the cache directory; repeatable',
  },
  gh: {
    kind: 'boolean',
    negatable: true,
    help: 'with --remotes: classify on git evidence alone (without --remotes gh is never called)',
  },
  fetch: {
    kind: 'boolean',
    negatable: true,
    help: 'with --remotes: classify on the remote-tracking refs already on disk (without --remotes nothing is fetched)',
  },
  progress: {
    kind: 'boolean',
    negatable: true,
    help: 'no status line on stderr (drawn only when stderr is a terminal)',
  },
} as const

const PATHS = [
  {
    name: 'path',
    variadic: true,
    help: 'a checkout, or a directory containing checkouts (default: the one you are in)',
  },
] as const

const OUTPUT = {
  kind: 'enum',
  choices: ['text', 'json'] as const,
  valueName: 'form',
  default: 'text',
  help: 'report format',
} as const

const statusCli = () =>
  defineCli({
    name: NAME,
    summary:
      'Inventory local branches and worktrees (remote branches too with --remotes), and say ' +
      'which have been merged into the default branch. Offline unless --remotes, which fetches ' +
      'each remote first and asks gh about pull requests; deletes nothing.',
    positionals: PATHS,
    flags: {
      ...SWEEP_FLAGS,
      keep: { kind: 'boolean', help: 'include safe-to-keep rows in the report' },
      commands: { kind: 'boolean', help: 'print the proposed commands only' },
      output: OUTPUT,
    },
    epilogue: `commands:
  ${NAME} [status]   this report (the default)
  ${NAME} summary    counts per repository: total, merged, delete, prune, review, keep
  ${NAME} plan       write the deletable rows as a plan
  ${NAME} apply      re-check, show the steps, ask, delete
  ${NAME} dev        run ${NAME} from a development checkout

Each command takes --help. A checkout directory named like a command is
swept as ./<name>.`,
  })

const summaryCli = () =>
  defineCli({
    name: `${NAME} summary`,
    summary:
      'Count local branches and worktrees (and remote branches with --remotes) per repository: how many there are, ' +
      'how many are merged into the default branch, and how many would be deleted, pruned, reviewed or kept.',
    positionals: PATHS,
    flags: { ...SWEEP_FLAGS, output: OUTPUT },
    epilogue:
      'merged: the work is on the default branch. Rows kept for structure (the default ' +
      'branch, the primary worktree) are counted in total but not judged merged.',
  })

const planCli = () =>
  defineCli({
    name: `${NAME} plan`,
    summary:
      'Sweep, and write the deletable rows as a plan for `apply`: each row with the facts its ' +
      'verdict rests on, so `apply` can tell what moved since.',
    positionals: PATHS,
    flags: {
      ...SWEEP_FLAGS,
      out: {
        kind: 'string',
        short: 'o',
        valueName: 'file',
        default: '-',
        help: 'write the plan here; - is stdout (the default)',
      },
    },
    epilogue: 'The one-line summary goes to stderr, so stdout carries only the plan.',
  })

const applyCli = () =>
  defineCli({
    name: `${NAME} apply`,
    summary:
      'Delete what a sweep or a saved plan found deletable: re-check each row, show the steps, ' +
      'ask, then delete compare-and-swap, verifying each step.',
    positionals: PATHS,
    flags: {
      ...SWEEP_FLAGS,
      plan: {
        kind: 'string',
        valueName: 'file',
        help: 'apply this plan (- reads stdin) instead of sweeping',
      },
      row: {
        kind: 'list',
        valueName: 'category:id',
        default: [],
        commaSeparated: false,
        help: 'apply only this row, e.g. local_branch:feat/x; repeatable (default: every row)',
      },
      allow: {
        kind: 'list',
        valueName: 'risk[=category:id]',
        default: [],
        commaSeparated: false,
        help: 'accept a risk for every row, or for one row; repeatable',
      },
      repoRoot: {
        kind: 'string',
        valueName: 'path',
        help: 'with a plan of several repositories: apply only the one rooted here',
      },
      receipt: {
        kind: 'string',
        valueName: 'file',
        help: 'write the receipt here (default: beside a --plan file; none otherwise)',
      },
      yes: { kind: 'boolean', short: 'y', help: 'delete without asking' },
      dryRun: { kind: 'boolean', help: 're-check and print the steps; delete nothing' },
      output: OUTPUT,
    },
    epilogue: `risks: abandon-unmerged, discard-changes, confirm-open-pr
A row that carries a risk you did not --allow is dropped, never deleted.`,
  })

/**
 * Asks a yes/no question, or returns null when there is no one to ask. `main`
 * takes it as a parameter so a test can answer.
 */
export type Confirm = (question: string) => boolean | null

const terminalConfirm: Confirm = (question) => (canPrompt() ? askYesNo(question) : null)

export interface MainDeps {
  confirm?: Confirm
  /** Reads `--plan -`. Defaults to stdin. */
  readStdin?: () => string
  /** Whether stderr is a terminal, so a status line may be drawn. Defaults to `isatty(2)`. */
  stderrIsTerminal?: boolean
  /** The terminal's size, for the live step board. Defaults to stdout's columns and rows. */
  terminalSize?: () => { width: number; height: number }
}

const PAUSE = new Int32Array(new SharedArrayBuffer(4))

/**
 * All of stdin, synchronously. A pipe can be non-blocking and still empty
 * when the writer upstream has not produced anything yet; `readFileSync(0)`
 * fails with EAGAIN there, so this waits and retries until end of input.
 */
function readAllStdin(): string {
  const chunks: Buffer[] = []
  const buf = Buffer.alloc(65536)
  for (;;) {
    let n: number
    try {
      n = readSync(0, buf, 0, buf.length, null)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EAGAIN') throw e
      Atomics.wait(PAUSE, 0, 0, 50)
      continue
    }
    if (n === 0) return Buffer.concat(chunks).toString('utf8')
    chunks.push(Buffer.from(buf.subarray(0, n)))
  }
}

function usageError(ctx: CliContext, name: string, message: string): number {
  ctx.io.stderr(`${name}: ${message}\n`)
  return EXIT.usage
}

function failure(ctx: CliContext, err: unknown): number {
  ctx.io.stderr(`${NAME}: ${err instanceof Error ? err.message : String(err)}\n`)
  return EXIT.error
}

interface SweepValues {
  only?: string[] | undefined
  branch?: string | undefined
  remote?: string | undefined
  remoteUrl: string[]
  remotes: boolean
  gh: boolean
  fetch: boolean
  progress: boolean
}

type Swept =
  | {
      kind: 'ok'
      result: SweepResult
      branch: string | undefined
      values: SweepValues
      /** What the sweep gathered. */
      scope: readonly Scope[]
      /** True when the sweep did not call gh, so the re-check must not either. */
      noGh: boolean
    }
  /** No entry named a repository; the verb reports it and exits 10. */
  | { kind: 'nothing'; result: SweepResult }
  | { kind: 'exit'; code: number }

/** Color for a report on `stream`, when it is a terminal that takes color. */
function styleFor(ctx: CliContext, stream: 'stdout' | 'stderr'): Style {
  const level = detectColorLevel({ env: ctx.env, isTTY: ctx.terminal?.[stream] === true })
  return level === 'none' ? PLAIN : TERMINAL_STYLE
}

/** The note under a text report that left remote branches out, or '' when it did not. */
function remotesNote(swept: Swept, style: Style): string {
  if (swept.kind !== 'ok' || swept.scope.includes('remote-branches')) return ''
  if (!swept.result.repos.some((r) => r.repo?.remote != null)) return ''
  return (
    style.muted(
      'Local only: nothing fetched, no gh, remote branches not checked; add --remotes for all three.',
    ) + '\n'
  )
}

/** Where `--remote-url` keeps its clones. */
function mirrorCache(ctx: CliContext): string {
  return systemDirs(VENDOR_DIRS, { env: ctx.env }).standalone(NAME).cache().app('remotes').path
}

/** Local work by default: remote branches only when asked for, with `--remotes` or `--only remotes`. */
const LOCAL_SCOPE: readonly Scope[] = ['worktrees', 'local-branches']

function sweepScope(only: readonly string[] | undefined, remotes: boolean): Scope[] {
  const scope = only === undefined ? [...LOCAL_SCOPE] : only.map((s) => ONLY[s]!)
  if (remotes && !scope.includes('remote-branches')) scope.push('remote-branches')
  return scope
}

/** Validate the sweep flags and run the sweep, or answer with the exit code. */
function sweep(
  name: string,
  v: SweepValues,
  paths: readonly string[],
  ctx: CliContext,
  status: StatusLine,
): Swept {
  const only = v.only?.filter((s) => s !== '')
  const unknown = (only ?? []).filter((s) => !(s in ONLY))
  if (unknown.length > 0) {
    const message = `unknown --only value(s): ${unknown.join(', ')}`
    return { kind: 'exit', code: usageError(ctx, name, message) }
  }
  if (v.branch !== undefined && paths.length > 0) {
    const message = '--branch sweeps this repository only; drop the paths'
    return { kind: 'exit', code: usageError(ctx, name, message) }
  }
  // An empty URL is refused, not dropped: `--remote-url "$UNSET"` must not
  // fall back to sweeping the checkout you are standing in.
  if (v.remoteUrl.some((u) => u.trim() === '')) {
    return {
      kind: 'exit',
      code: usageError(ctx, name, '--remote-url needs a URL; got an empty one'),
    }
  }
  const urls = v.remoteUrl
  if (urls.length > 0) {
    const conflict =
      paths.length > 0
        ? '--remote-url sweeps a remote, not a checkout; drop the paths'
        : v.branch !== undefined
          ? '--branch reads the checkout you are in; it does not combine with --remote-url'
          : (only ?? []).some((s) => s !== 'remotes')
            ? '--remote-url has remote branches only; drop --only or pass --only remotes'
            : null
    if (conflict !== null) return { kind: 'exit', code: usageError(ctx, name, conflict) }
  }

  let branch: string | undefined
  try {
    branch = v.branch === undefined ? undefined : resolveBranch(v.branch, new Git(ctx.cwd))
  } catch (err) {
    return { kind: 'exit', code: failure(ctx, err) }
  }

  const scope: Scope[] = urls.length > 0 ? ['remote-branches'] : sweepScope(only, v.remotes)
  const online = scope.includes('remote-branches')
  const options: SweepReposOptions = {
    baseDir: ctx.cwd,
    cwd: ctx.cwd,
    // Local by default means offline: the fetch and gh go with remote branches.
    noGh: !(online && v.gh),
    fetch: online && v.fetch,
    branch,
    // Mid-walk, while the wait is happening — the summary comes too late to
    // explain why the tool appeared to hang.
    onWarn: (message) => ctx.io.stderr(`${NAME}: ${message}\n`),
    ...(v.progress ? { onProgress: (p) => status.update(describeSweep(p)) } : {}),
    scope,
    ...(v.remote === undefined ? {} : { remote: v.remote }),
  }
  let entries = paths.length > 0 ? [...paths] : [ctx.cwd]
  if (urls.length > 0) {
    const cache = mirrorCache(ctx)
    try {
      entries = urls.map((url, i) => {
        if (v.progress) status.update(`${NAME}: cloning remote ${i + 1}/${urls.length}`)
        return ensureMirror(url, cache)
      })
    } catch (err) {
      status.clear()
      return { kind: 'exit', code: failure(ctx, err) }
    }
  }
  if (v.progress) status.update(`${NAME}: finding repositories`)
  const result = sweepRepos(entries, options)
  status.clear()
  if (branch !== undefined && result.repos.length > 1) {
    const err = new Error(
      `--branch sweeps one repository; ${result.repos.length} found under ${ctx.cwd}`,
    )
    return { kind: 'exit', code: failure(ctx, err) }
  }
  const refused = branch === undefined ? null : (result.repos[0]?.error ?? null)
  if (refused !== null) return { kind: 'exit', code: failure(ctx, new Error(refused)) }
  if (result.repos.length === 0) return { kind: 'nothing', result }
  return { kind: 'ok', result, branch, values: v, scope, noGh: options.noGh === true }
}

/**
 * Name each repository the sweep could not read, on stderr. True when there
 * was one: a verb that acts on the sweep must not pass an unread repository
 * off as an empty one.
 */
function reportUnreadable(ctx: CliContext, name: string, result: SweepResult): boolean {
  const failed = result.repos.filter((r) => r.error !== null)
  for (const r of failed) ctx.io.stderr(`${name}: ${r.repo?.root ?? r.path}: ${r.error}\n`)
  return failed.length > 0
}

function planOf(swept: Extract<Swept, { kind: 'ok' }>, now: Date): Plan {
  const opts = {
    remote: swept.values.remote ?? null,
    noGh: swept.noGh,
    branch: swept.branch ?? null,
  }
  return {
    version: PLAN_VERSION,
    created_at: now.toISOString(),
    repos: swept.result.repos.flatMap((s) =>
      s.repo === null ? [] : [planRepo(s.repo.root, opts, s.items)],
    ),
  }
}

function runStatus(argv: readonly string[], ctx: CliContext, status: StatusLine): number {
  const parsed = statusCli().parse(argv, ctx.io)
  if (parsed.status === 'help') return EXIT.ok
  if (parsed.status === 'error') return usageError(ctx, NAME, parsed.message)
  const v = parsed.values
  const style = styleFor(ctx, 'stdout')
  const render = (r: SweepResult): string =>
    v.output === 'json' ? renderJson(r) : renderText(r, { keep: v.keep, style })
  const swept = sweep(NAME, v, parsed.positionals, ctx, status)
  if (swept.kind === 'exit') return swept.code
  if (swept.kind === 'nothing') {
    ctx.io.stdout(render(swept.result))
    return EXIT_NOTHING_TO_SWEEP
  }

  if (v.commands) {
    const commands = proposedCommands(swept.result)
    if (commands.length > 0) ctx.io.stdout(commands.join('\n') + '\n')
  } else {
    ctx.io.stdout(render(swept.result))
    if (v.output === 'text') ctx.io.stdout(remotesNote(swept, style))
  }
  return EXIT.ok
}

function runSummary(argv: readonly string[], ctx: CliContext, status: StatusLine): number {
  const name = `${NAME} summary`
  const parsed = summaryCli().parse(argv, ctx.io)
  if (parsed.status === 'help') return EXIT.ok
  if (parsed.status === 'error') return usageError(ctx, name, parsed.message)
  const v = parsed.values
  const style = styleFor(ctx, 'stdout')
  const render = (r: SweepResult): string =>
    v.output === 'json' ? renderCountsJson(r) : renderCountsText(r, style)
  const swept = sweep(name, v, parsed.positionals, ctx, status)
  if (swept.kind === 'exit') return swept.code
  ctx.io.stdout(render(swept.result))
  if (v.output === 'text') ctx.io.stdout(remotesNote(swept, style))
  return swept.kind === 'nothing' ? EXIT_NOTHING_TO_SWEEP : EXIT.ok
}

function runPlan(argv: readonly string[], ctx: CliContext, status: StatusLine): number {
  const name = `${NAME} plan`
  const parsed = planCli().parse(argv, ctx.io)
  if (parsed.status === 'help') return EXIT.ok
  if (parsed.status === 'error') return usageError(ctx, name, parsed.message)
  const v = parsed.values
  const swept = sweep(name, v, parsed.positionals, ctx, status)
  if (swept.kind === 'exit') return swept.code
  // stdout carries only the plan, so the summary goes to stderr either way.
  if (swept.kind === 'nothing') {
    ctx.io.stderr(renderSummary(swept.result) + '\n')
    return EXIT_NOTHING_TO_SWEEP
  }

  const plan = planOf(swept, new Date())
  const unreadable = reportUnreadable(ctx, name, swept.result)
  const style = styleFor(ctx, 'stderr')
  ctx.io.stderr(renderSummary(swept.result, style) + '\n' + remotesNote(swept, style))
  if (v.out === '-') {
    ctx.io.stdout(`${JSON.stringify(plan, null, 2)}\n`)
  } else {
    const path = resolve(ctx.cwd, v.out)
    writePlan(path, plan)
    ctx.io.stderr(`plan: ${path}\n`)
  }
  return unreadable ? EXIT.error : EXIT.ok
}

/** `<dir>/<name>.receipt-<stamp>.json` for plan `<dir>/<name>.json`. */
function receiptBeside(planPath: string, now: Date): string {
  const stem = basename(planPath).replace(/\.json$/i, '')
  return join(dirname(planPath), `${stem}.receipt-${fileStamp(now)}.json`)
}

const dropKey = (d: Receipt['dropped'][number]): string =>
  JSON.stringify([d.repo, d.category, d.id])

/** Rows the run would delete or prune: one each, however many steps (an unlock, a remove) it takes. */
function wouldRun(receipt: Receipt): number {
  return rowsActedOn(summarizeReceipt(receipt))
}

type ApplyValues = Extract<
  ReturnType<ReturnType<typeof applyCli>['parse']>,
  { status: 'ok' }
>['values']

/** Where `apply`'s plan came from, and what that decides about the run. */
interface LoadedPlan {
  plan: Plan
  /** Shown in the receipt: the plan's path, `(stdin)` or `(swept)`. */
  source: string
  receiptPath: string | null
  /** A swept repository could not be read: the run exits 1 whatever else happens. */
  unreadable: boolean
  /** The sweep's items by repository root, so the preview need not sweep again. */
  swept: Map<string, SweepItem[]> | undefined
}

/** Sweep and plan in memory, or read `--plan`; or answer with the exit code. */
function loadPlan(
  name: string,
  v: ApplyValues,
  paths: readonly string[],
  ctx: CliContext,
  deps: MainDeps,
  status: StatusLine,
  now: Date,
): LoadedPlan | number {
  const receiptPath = v.receipt === undefined ? null : resolve(ctx.cwd, v.receipt)
  if (v.plan === undefined) {
    const swept = sweep(name, v, paths, ctx, status)
    if (swept.kind === 'exit') return swept.code
    if (swept.kind === 'nothing') {
      ctx.io.stdout(v.output === 'json' ? renderJson(swept.result) : renderText(swept.result))
      return EXIT_NOTHING_TO_SWEEP
    }
    const items = new Map<string, SweepItem[]>()
    for (const r of swept.result.repos) if (r.repo !== null) items.set(r.repo.root, r.items)
    return {
      plan: planOf(swept, now),
      source: '(swept)',
      receiptPath,
      unreadable: reportUnreadable(ctx, name, swept.result),
      swept: items,
    }
  }
  try {
    if (v.plan === '-') {
      const plan = parsePlan((deps.readStdin ?? readAllStdin)(), 'stdin')
      return { plan, source: '(stdin)', receiptPath, unreadable: false, swept: undefined }
    }
    const source = resolve(ctx.cwd, v.plan)
    const plan = readPlan(source)
    return {
      plan,
      source,
      receiptPath: receiptPath ?? receiptBeside(source, now),
      unreadable: false,
      swept: undefined,
    }
  } catch (err) {
    return failure(ctx, err)
  }
}

/** The run's flags that contradict each other, as a usage message, or null. */
function applyConflict(v: ApplyValues, paths: readonly string[]): string | null {
  if (v.plan !== undefined) {
    const sweepFlags = [
      paths.length > 0 ? 'paths' : null,
      v.only !== undefined ? '--only' : null,
      v.branch !== undefined ? '--branch' : null,
      v.remote !== undefined ? '--remote' : null,
      v.remoteUrl.length > 0 ? '--remote-url' : null,
    ].filter((f) => f !== null)
    if (sweepFlags.length > 0) return `--plan fixes what is swept; drop ${sweepFlags.join(', ')}`
  }
  if (v.plan === '-' && !v.yes && !v.dryRun) {
    return '--plan - reads the plan from stdin, so it cannot ask; pass --yes or --dry-run'
  }
  return null
}

function runApply(
  argv: readonly string[],
  ctx: CliContext,
  deps: MainDeps,
  status: StatusLine,
): number {
  const name = `${NAME} apply`
  const parsed = applyCli().parse(argv, ctx.io)
  if (parsed.status === 'help') return EXIT.ok
  if (parsed.status === 'error') return usageError(ctx, name, parsed.message)
  const v = parsed.values
  const paths = parsed.positionals

  let rows: RowRef[]
  let grants: Grant[]
  try {
    rows = v.row.map(parseRowRef)
    grants = v.allow.map(parseGrant)
  } catch (err) {
    if (err instanceof ApplyArgumentError) return usageError(ctx, name, err.message)
    throw err
  }
  const conflict = applyConflict(v, paths)
  if (conflict !== null) return usageError(ctx, name, conflict)

  const now = new Date()
  const loaded = loadPlan(name, v, paths, ctx, deps, status, now)
  if (typeof loaded === 'number') return loaded
  const { plan, source, receiptPath } = loaded
  // A plan from `--remote-url` names a clone in the cache. Its deletes are
  // pushed from there, so the clone must still push only where it fetches from.
  const cacheDir = mirrorCache(ctx)
  const cache = (existsSync(cacheDir) ? realpathSync(cacheDir) : cacheDir) + sep
  for (const repo of plan.repos) {
    if (!repo.root.startsWith(cache)) continue
    const problem = mirrorProblem(repo.root)
    if (problem !== null) return failure(ctx, new Error(`${problem}; refusing to apply`))
  }
  const ok = (): number => (loaded.unreadable ? EXIT.error : EXIT.ok)

  const repoRoot = v.repoRoot === undefined ? undefined : resolve(ctx.cwd, v.repoRoot)
  // On a terminal the run is shown live: every step first, then each one
  // checked off as it finishes, with a bar on the status line.
  const live = v.output === 'text' && ctx.terminal?.stdout === true
  const style = styleFor(ctx, 'stdout')
  const print = (receipt: Receipt, shownPath: string | null, steps = true): void => {
    ctx.io.stdout(
      v.output === 'json'
        ? `${JSON.stringify({ receiptPath: shownPath, summary: summarizeReceipt(receipt), receipt }, null, 2)}\n`
        : renderReceipt(receipt, shownPath, style, { steps }),
    )
  }

  const planned = plan.repos.filter(
    (r) => repoRoot === undefined || resolve(r.root) === resolve(repoRoot),
  )
  if (repoRoot !== undefined && planned.length === 0) {
    return failure(ctx, new Error(`no plan repository at ${repoRoot}`))
  }
  if (rows.length === 0 && planned.every((r) => r.rows.length === 0)) {
    if (v.output === 'json') print(emptyReceipt(source, now, v.dryRun), null)
    else ctx.io.stdout('nothing to delete\n')
    return ok()
  }

  const base = {
    callerCwd: ctx.cwd,
    planPath: source,
    repoRoot,
    // An implicit selection runs only safe-to-delete rows, in the preview and
    // in the run it confirms, whose rows are passed explicitly.
    safeOnly: rows.length === 0,
    ...(v.progress
      ? {
          onSweepProgress: (p: SweepProgress) => status.update(`re-checking ${describeSweep(p)}`),
          onStep: (i: number, total: number, step: Step) =>
            status.update(describeStep(i, total, step)),
        }
      : {}),
  }

  let preview: Receipt
  try {
    // A sweep that just ran is the preview's re-check; the run that deletes sweeps again.
    preview = applyPlan(plan, rows, grants, {
      ...base,
      dryRun: true,
      receiptPath: null,
      swept: loaded.swept,
    })
  } catch (err) {
    return failure(ctx, err)
  }

  const count = wouldRun(preview)
  if (v.dryRun || count === 0) {
    if (live) ctx.io.stdout(renderPreview(preview, style))
    else print(preview, null)
    return ok()
  }
  if (!v.yes) {
    const declined = confirm(ctx, name, preview, count, v.output === 'json', deps)
    if (declined !== null) return declined
  } else if (live) {
    ctx.io.stdout(renderPreview(preview, style))
  }
  if (live) ctx.io.stdout('\n')

  // Only what the preview showed: rows it dropped stay dropped.
  // Pinned to their repositories: a branch name two repositories share stays two rows.
  const approved = preview.steps.flatMap((s) =>
    s.row === null ? [] : [{ ...s.row, repo: s.repo }],
  )
  const approvedGrants = grants.filter(
    (g) =>
      g.row === null || approved.some((r) => r.category === g.row!.category && r.id === g.row!.id),
  )
  const size =
    deps.terminalSize ??
    (() => ({
      width: ctx.terminal?.columns || process.stdout.columns || 80,
      height: process.stdout.rows || 24,
    }))
  let board: StepBoard | undefined
  let receipt: Receipt
  try {
    receipt = applyPlan(plan, approved, approvedGrants, {
      ...base,
      dryRun: false,
      receiptPath,
      dropped: preview.dropped,
      ...(live
        ? {
            // The board carries the run's progress; the status line stays clear.
            onStart: (steps: readonly Step[]) => {
              board = stepBoard(ctx.io.stdout, steps, size, style)
              board.draw(null)
            },
            onStep: (i: number) => board?.draw(i),
            onStepDone: () => board?.draw(null),
          }
        : {}),
    })
  } catch (err) {
    return failure(ctx, err)
  }
  status.clear()
  if (live) {
    // The run's own re-check can drop a row the preview showed, if it moved
    // while the question was open: say which, since it gets no tick.
    const seen = new Set(preview.dropped.map(dropKey))
    const late = receipt.dropped.filter((d) => !seen.has(dropKey(d)))
    if (late.length > 0) ctx.io.stdout(`\n${renderPreviewDrops(late, style)}`)
    // A failed step's error, in full: its row on the board is cut to the width.
    const failed = receipt.steps.find((s) => s.result === 'failed')
    if (failed !== undefined) ctx.io.stdout(`\n${renderStepDone(failed, style)}\n`)
    ctx.io.stdout('\n')
  }
  print(receipt, receiptPath, !live)
  if (receiptPath === null) {
    ctx.io.stderr(`${name}: no receipt written; pass --receipt <file> to keep one\n`)
  }
  return receipt.status === 'failed' ? EXIT_STEP_FAILED : ok()
}

/**
 * Show the preview and ask. Null to go ahead; otherwise the exit code: 0 for
 * a no, 2 when there is no one to ask.
 */
function confirm(
  ctx: CliContext,
  name: string,
  preview: Receipt,
  count: number,
  json: boolean,
  deps: MainDeps,
): number | null {
  // The preview is for the person answering, so it goes where the question does.
  const show = json ? ctx.io.stderr : ctx.io.stdout
  show(renderPreview(preview, styleFor(ctx, json ? 'stderr' : 'stdout')))
  const answer = (deps.confirm ?? terminalConfirm)(`Delete ${count} item${count === 1 ? '' : 's'}?`)
  if (answer === null) {
    return usageError(ctx, name, 'refusing to delete without a terminal to ask; pass --yes')
  }
  if (!answer) {
    ctx.io.stderr('nothing deleted\n')
    return EXIT.ok
  }
  return null
}

function emptyReceipt(plan: string, now: Date, dryRun: boolean): Receipt {
  const at = now.toISOString()
  return {
    version: RECEIPT_VERSION,
    plan,
    status: dryRun ? 'dry-run' : 'complete',
    started_at: at,
    finished_at: at,
    dropped: [],
    steps: [],
  }
}

/** `main(argv, ctx)`: returns an exit code, never exits. */
export function main(argv: readonly string[], ctx: CliContext, deps: MainDeps = {}): number {
  const terminal = deps.stderrIsTerminal ?? isatty(2)
  const status = terminal
    ? statusLine(ctx.io.stderr, () => process.stderr.columns || 80)
    : NO_STATUS_LINE
  // Anything else written erases the status line first, so it never trails into output.
  const io = {
    stdout: (text: string) => {
      status.clear()
      ctx.io.stdout(text)
    },
    stderr: (text: string) => {
      status.clear()
      ctx.io.stderr(text)
    },
  }
  const c: CliContext = { ...ctx, io }
  const [sub, ...rest] = argv
  try {
    if (sub === 'summary') return runSummary(rest, c, status)
    if (sub === 'plan') return runPlan(rest, c, status)
    if (sub === 'apply') return runApply(rest, c, deps, status)
    if (sub === 'status') return runStatus(rest, c, status)
    return runStatus(argv, c, status)
  } finally {
    status.clear()
  }
}
