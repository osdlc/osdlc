/**
 * `repo-cleaner` — what has been merged, and what can go away.
 *
 * Two commands. A bare invocation sweeps: it inventories, fetching each
 * remote first unless `--no-fetch`, and writes nothing but an optional plan.
 * `repo-cleaner apply` deletes the rows of a plan that were selected and
 * authorized. Scope is opt-in: the sweep covers the repository you are
 * standing in unless `--all` or a path says otherwise.
 *
 * Exit codes:
 *   0   swept; or every selected row was applied or dropped with a reason
 *   1   failed against the state it found
 *   2   cannot run as typed
 *   10  nothing to sweep: no entry named a repository
 *   11  apply stopped at a failed step; the receipt says which
 */

import { resolve } from 'node:path'

import { EXIT, TieredDirs, defineCli, type CliContext } from '@osdlc/cli-tool'
import { Git } from '@osdlc/typed-git'

import { resolveBranch } from './branches.ts'
import { ApplyArgumentError, applyPlan, parseGrant, parseRowRef, type Grant } from './apply.ts'
import {
  CONFIG_ENV,
  TOOL,
  VENDOR_DIRS,
  clearConfigCache,
  configPath,
  configuredRepos,
} from './config.ts'
import { PLAN_VERSION, planRepo, readPlan, stampedPath, writePlan } from './plan.ts'
import type { RowRef } from './receipt.ts'
import { proposedCommands, renderJson, renderReceipt, renderText } from './render.ts'
import { sweepRepos, type SweepReposOptions } from './sweep.ts'
import { ALL_SCOPES } from './types.ts'

const EXIT_NOTHING_TO_SWEEP = 10
const EXIT_STEP_FAILED = 11

/** `<durable-home>/repo-cleaner/<kind>`, where plans and receipts go by default. */
function stateDir(ctx: CliContext, kind: 'plans' | 'receipts'): string {
  return resolve(
    TieredDirs.fromEnv(VENDOR_DIRS.vendor, VENDOR_DIRS.envVars, { env: ctx.env })
      .standalone(TOOL)
      .durable().path,
    kind,
  )
}

/** Built per run: the help names the config path as the environment has it then. */
const sweepCli = () =>
  defineCli({
    name: 'repo-cleaner',
    summary:
      'Inventory branches, worktrees and remote branches, and say which have been merged into ' +
      'the default branch. Fetches each remote first; writes nothing but an optional plan.',
    positionals: [
      {
        name: 'path',
        variadic: true,
        help: 'a checkout, or a directory containing checkouts (default: the one you are in)',
      },
    ],
    flags: {
      all: { kind: 'boolean', help: 'sweep the repositories in the config file' },
      config: { kind: 'string', valueName: 'path', help: 'config file to read' },
      scope: {
        kind: 'list',
        valueName: 'list',
        help: `comma-separated: ${ALL_SCOPES.join(', ')}`,
      },
      remote: {
        kind: 'string',
        valueName: 'name',
        help: 'remote to measure against (default: origin)',
      },
      gh: { kind: 'boolean', negatable: true, help: 'classify on git evidence alone' },
      fetch: {
        kind: 'boolean',
        negatable: true,
        help: 'classify on the remote-tracking refs already on disk',
      },
      keep: { kind: 'boolean', help: 'include safe-to-keep rows in the report' },
      commands: { kind: 'boolean', help: 'print the proposed commands only' },
      branch: {
        kind: 'string',
        valueName: 'name|HEAD',
        help: 'sweep only this branch of this repository: its worktree, local and remote branch',
      },
      writePlan: { kind: 'boolean', help: 'write the deletable rows as a plan for `apply`' },
      planOut: {
        kind: 'string',
        valueName: 'path',
        help: 'write the plan here; implies --write-plan',
      },
      output: {
        kind: 'enum',
        choices: ['text', 'json'] as const,
        valueName: 'form',
        default: 'text',
        help: 'report format',
      },
    },
    epilogue: `commands:
  repo-cleaner apply --help   delete the approved rows of a plan

A checkout directory named "apply" is swept as ./apply.

config: ${configPath()}
plans:  <durable home>/repo-cleaner/plans/ unless --plan-out`,
  })

const applyCli = () =>
  defineCli({
    name: 'repo-cleaner apply',
    summary:
      'Apply approved rows of a plan: re-check them, delete compare-and-swap, verify each step, ' +
      'and write a receipt.',
    flags: {
      plan: {
        kind: 'string',
        valueName: 'path',
        required: true,
        help: 'plan file from `repo-cleaner --write-plan`',
      },
      row: {
        kind: 'list',
        valueName: 'category:id',
        default: [],
        commaSeparated: false,
        help: 'row to apply, e.g. local_branch:feat/x; repeatable',
      },
      authorize: {
        kind: 'list',
        valueName: 'name[=category:id]',
        default: [],
        commaSeparated: false,
        help: 'authorization for every row, or for one row; repeatable',
      },
      repoRoot: {
        kind: 'string',
        valueName: 'path',
        help: 'apply only the plan repository rooted here',
      },
      receiptDir: { kind: 'string', valueName: 'dir', help: 'write the receipt here' },
      dryRun: { kind: 'boolean', help: 're-check and print the steps; delete nothing' },
      output: {
        kind: 'enum',
        choices: ['text', 'json'] as const,
        valueName: 'form',
        default: 'text',
        help: 'report format',
      },
    },
    epilogue: 'receipts: <durable home>/repo-cleaner/receipts/ unless --receipt-dir',
  })

function usageError(ctx: CliContext, name: string, message: string): number {
  ctx.io.stderr(`${name}: ${message}\n`)
  return EXIT.usage
}

function failure(ctx: CliContext, err: unknown): number {
  ctx.io.stderr(`repo-cleaner: ${err instanceof Error ? err.message : String(err)}\n`)
  return EXIT.error
}

/** Runs `fn` with the shared loader pointed at `path`, then restores it. */
function withConfigFile<T>(path: string | undefined, fn: () => T): T {
  if (path === undefined) return fn()
  const prior = process.env[CONFIG_ENV]
  process.env[CONFIG_ENV] = path
  clearConfigCache()
  try {
    return fn()
  } finally {
    if (prior === undefined) delete process.env[CONFIG_ENV]
    else process.env[CONFIG_ENV] = prior
    clearConfigCache()
  }
}

function runSweep(argv: readonly string[], ctx: CliContext): number {
  const parsed = sweepCli().parse(argv, ctx.io)
  if (parsed.status === 'help') return EXIT.ok
  if (parsed.status === 'error') return usageError(ctx, 'repo-cleaner', parsed.message)
  const v = parsed.values
  const paths = parsed.positionals

  const scope = v.scope?.filter((s) => s !== '')
  const unknown = (scope ?? []).filter((s) => !(ALL_SCOPES as readonly string[]).includes(s))
  if (unknown.length > 0) {
    return usageError(ctx, 'repo-cleaner', `unknown scope(s): ${unknown.join(', ')}`)
  }
  if (v.branch !== undefined && (v.all || paths.length > 0)) {
    return usageError(
      ctx,
      'repo-cleaner',
      '--branch sweeps this repository only; drop --all and paths',
    )
  }

  if (v.config !== undefined && !v.all) {
    return usageError(ctx, 'repo-cleaner', '--config is read only with --all')
  }

  let branch: string | undefined
  try {
    branch = v.branch === undefined ? undefined : resolveBranch(v.branch, new Git(ctx.cwd))
  } catch (err) {
    return failure(ctx, err)
  }

  const entries = [...paths]
  if (v.all) {
    try {
      entries.push(...withConfigFile(v.config, () => configuredRepos(undefined, ctx.cwd)))
    } catch (err) {
      return failure(ctx, err)
    }
  }
  if (entries.length === 0) entries.push(ctx.cwd)

  const options: SweepReposOptions = {
    baseDir: ctx.cwd,
    cwd: ctx.cwd,
    noGh: !v.gh,
    fetch: v.fetch,
    branch,
    // Mid-walk, while the wait is happening — the summary comes too late to
    // explain why the tool appeared to hang.
    onWarn: (message) => ctx.io.stderr(`repo-cleaner: ${message}\n`),
    ...(scope === undefined ? {} : { scope }),
    ...(v.remote === undefined ? {} : { remote: v.remote }),
  }
  const result = sweepRepos(entries, options)
  if (branch !== undefined && result.repos.length > 1) {
    return failure(
      ctx,
      new Error(`--branch sweeps one repository; ${result.repos.length} found under ${ctx.cwd}`),
    )
  }
  const refused = branch === undefined ? null : (result.repos[0]?.error ?? null)
  if (refused !== null) return failure(ctx, new Error(refused))
  if (result.repos.length === 0) {
    ctx.io.stdout(v.output === 'json' ? renderJson(result) : renderText(result))
    return EXIT_NOTHING_TO_SWEEP
  }

  let planPath: string | null = null
  if (v.writePlan || v.planOut !== undefined) {
    const now = new Date()
    planPath =
      v.planOut !== undefined
        ? resolve(ctx.cwd, v.planOut)
        : stampedPath(stateDir(ctx, 'plans'), now)
    const planOpts = { remote: v.remote ?? null, noGh: !v.gh, branch: branch ?? null }
    writePlan(planPath, {
      version: PLAN_VERSION,
      created_at: now.toISOString(),
      repos: result.repos.flatMap((sweep) =>
        sweep.repo === null ? [] : [planRepo(sweep.repo.root, planOpts, sweep.items)],
      ),
    })
  }

  if (v.commands) {
    const commands = proposedCommands(result)
    if (commands.length > 0) ctx.io.stdout(commands.join('\n') + '\n')
  } else if (v.output === 'json') {
    ctx.io.stdout(renderJson(result, planPath === null ? {} : { plan_path: planPath }))
  } else {
    ctx.io.stdout(renderText(result, { keep: v.keep }))
  }
  if (planPath !== null && v.output !== 'json') ctx.io.stderr(`plan: ${planPath}\n`)
  return EXIT.ok
}

function runApply(argv: readonly string[], ctx: CliContext): number {
  const name = 'repo-cleaner apply'
  const parsed = applyCli().parse(argv, ctx.io)
  if (parsed.status === 'help') return EXIT.ok
  if (parsed.status === 'error') return usageError(ctx, name, parsed.message)
  const v = parsed.values

  let rows: RowRef[]
  let grants: Grant[]
  try {
    rows = v.row.map(parseRowRef)
    grants = v.authorize.map(parseGrant)
  } catch (err) {
    if (err instanceof ApplyArgumentError) return usageError(ctx, name, err.message)
    throw err
  }

  const planPath = resolve(ctx.cwd, v.plan)
  const repoRoot = v.repoRoot === undefined ? undefined : resolve(ctx.cwd, v.repoRoot)
  const receiptDir =
    v.receiptDir === undefined ? stateDir(ctx, 'receipts') : resolve(ctx.cwd, v.receiptDir)
  const receiptPath = stampedPath(receiptDir, new Date())
  let receipt
  try {
    receipt = applyPlan(readPlan(planPath), rows, grants, {
      callerCwd: ctx.cwd,
      dryRun: v.dryRun,
      receiptPath,
      planPath,
      repoRoot,
    })
  } catch (err) {
    return failure(ctx, err)
  }

  const shownPath = v.dryRun ? null : receiptPath
  ctx.io.stdout(
    v.output === 'json'
      ? `${JSON.stringify({ receiptPath: shownPath, receipt }, null, 2)}\n`
      : renderReceipt(receipt, shownPath),
  )
  return receipt.status === 'failed' ? EXIT_STEP_FAILED : EXIT.ok
}

/** `main(argv, ctx)`: returns an exit code, never exits. */
export function main(argv: readonly string[], ctx: CliContext): number {
  const [sub, ...rest] = argv
  return sub === 'apply' ? runApply(rest, ctx) : runSweep(argv, ctx)
}
