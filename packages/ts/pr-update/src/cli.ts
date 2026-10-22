/**
 * `pr-update` — the standalone CLI.
 *
 * Subcommands `survey`, `update`, `config` and `trust`, each declared to `defineCli`
 * separately (there is no subcommand primitive in `defineCli` itself — the
 * dispatch on `argv[0]` below is the whole of it, same as every other
 * multi-command tool in this workspace).
 *
 * Config layers: a flag beats `pr-update.local.yaml`, which beats
 * `pr-update.yaml` (the `pr_update:` and `code_host:` blocks;
 * `PR_UPDATE_CONFIG` relocates the pair), which beats the built-in defaults
 * (see `config-file.ts`) — every `PrUpdateConfig` key has a default, so
 * `survey` and `update` work with no config file at all. The binary reads no
 * other file. `config` reads and edits those files, and `trust` records
 * consent to the commands a project's config names.
 *
 * Exit code: `0` on a fully clean run (`survey`, always; `update` only when
 * every target ended `updated`/`up-to-date`/deliberately skipped), `1` when
 * the command ran to completion but didn't fully succeed against the state it
 * found (an unexpected thrown error, caught by `runMain`; or, for `update`,
 * any target left `conflict`/`failed` — read `results`/`counts` for which),
 * `2` on a malformed command line, `14` when the config file is unusable
 * (invalid or unreadable), `21` when `update` was refused for want of
 * repository trust, `22` when a tool the run needs (`git`, and `gh` or `curl`
 * for the code host) is not on PATH, `23` when the code host cannot be used
 * (no Forgejo token, or its PR listing failed) and `24` when the git remote
 * cannot be read.
 *
 * The code host is chosen by `selectCodeHost` from the `origin` remote, or
 * `code_host.override`; a failed PR listing is an error, never "no open PRs".
 */

import { mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { atomicWrite } from '@osdlc/etag-write'
import { EXIT, defineCli, type CliContext } from '@osdlc/cli-tool'
import { spawnRunner, type CommandRunner } from '@osdlc/command-seam'
import type { CodeHostName } from '@osdlc/code-host'
import { Git } from '@osdlc/typed-git'
import { CONFIG_INVALID_EXIT, ConfigInvalidError, type ConfigFileSpec } from '@osdlc/config-layers'

import { CodeHostSetupError, selectedCodeHostFor } from './code-host.ts'
import { runConfigCommand } from './config-cli.ts'
import { loadConfigLayers } from './config-file.ts'
import { standalonePorts } from './defaults.ts'
import {
  EXIT_CODE_HOST,
  FORGEJO_TOKEN_ENV,
  gitMissingFailure,
  listingHint,
  preflight,
  type PreflightFailure,
  type WhichSeam,
} from './preflight.ts'
import { REPAIR_AGENTS, REPAIR_AGENT_SUMMARIES, type RepairAgent } from './repair/names.ts'
import { PrListError, SurveyUsageError, renderSurveyText, runSurvey } from './survey.ts'
import {
  EXIT_UNTRUSTED,
  prUpdateTrustStore,
  untrustedMessage,
  withoutRepairChoice,
} from './trust.ts'
import {
  output as updateOutputSchema,
  renderUpdateText,
  runUpdate,
  type UpdateEnv,
  type UpdateOutput,
} from './update.ts'

/** The config file the binary reads, and the variable that relocates it. */
export const PR_UPDATE_CONFIG_FILE: ConfigFileSpec = {
  name: 'pr-update.yaml',
  envVar: 'PR_UPDATE_CONFIG',
}

type OutputForm = 'text' | 'json'

function resolveOutput(v: { output: OutputForm | undefined; json: boolean }): OutputForm {
  return v.output ?? (v.json ? 'json' : 'text')
}

function parseIntFlag(name: string, raw: string): number | { error: string } {
  const n = Number(raw)
  return Number.isInteger(n) ? n : { error: `--${name} must be an integer, got '${raw}'` }
}

/**
 * Give a bare `--branch` the branch checked out in `cwd`.
 *
 * The flag parser has no optional-value flag, so a `--branch` that ends the
 * line or is followed by another flag gets the current branch spliced in as its
 * value. `{ error }` when the checkout is not on a branch.
 */
function expandBranchFlag(argv: readonly string[], cwd: string): string[] | { error: string } {
  const out: string[] = []
  for (const [i, arg] of argv.entries()) {
    out.push(arg)
    if (arg !== '--branch') continue
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('-')) continue
    const current = new Git(cwd, { runner: spawnRunner('git') }).soft.currentBranch()
    if (current === null || current === '') {
      return { error: '--branch needs a branch name: this directory is not on a branch' }
    }
    out.push(current)
  }
  return out
}

function parsePrFlags(raw: readonly string[]): { numbers: number[] } | { error: string } {
  const numbers: number[] = []
  for (const text of raw) {
    const n = parseIntFlag('pr', text)
    if (typeof n !== 'number') return n
    numbers.push(n)
  }
  return { numbers }
}

const BRANCH_HELP =
  'Only the PR whose head is this branch. A bare --branch (no name) means the branch checked out in the current directory. No such PR is a usage error.'

const surveyCli = defineCli({
  name: 'pr-update survey',
  summary: "Report every open PR's drift from its base, in stack order.",
  flags: {
    author: {
      kind: 'string',
      valueName: 'login',
      help: 'Only PRs by this author (`@me` for yourself).',
    },
    repo: {
      kind: 'list',
      valueName: 'owner/name',
      default: [],
      help: 'Repository to survey; repeatable.',
    },
    fetch: {
      kind: 'boolean',
      negatable: true,
      help: 'Fetch before measuring. --no-fetch measures the refs as they stand.',
    },
    drafts: {
      kind: 'boolean',
      negatable: true,
      help: 'Include draft PRs. --no-drafts excludes them.',
    },
    limit: {
      kind: 'string',
      valueName: 'n',
      default: '100',
      help: 'Maximum open PRs per repository.',
    },
    remote: {
      kind: 'string',
      valueName: 'name',
      default: 'origin',
      help: 'Remote to measure against.',
    },
    pr: {
      kind: 'list',
      valueName: 'n',
      default: [],
      help: 'Only this PR and its stack parents; repeatable.',
    },
    branch: {
      kind: 'string',
      valueName: 'name',
      help: BRANCH_HELP,
    },
    output: {
      kind: 'enum',
      choices: ['text', 'json'] as const,
      valueName: 'form',
      help: 'text (aligned) or json. Default: text',
    },
    json: { kind: 'boolean', help: 'alias for --output json' },
  },
})

/** Lines the repair-agent help continues on, aligned under its help column. */
const REPAIR_AGENT_INDENT = ' '.repeat(24)

const updateCli = defineCli({
  name: 'pr-update update',
  summary: 'Bring out-of-date PRs up to date, in stack order.',
  flags: {
    author: {
      kind: 'string',
      valueName: 'login',
      help: 'Only PRs by this author (`@me` for yourself).',
    },
    repo: {
      kind: 'list',
      valueName: 'owner/name',
      default: [],
      help: 'Repository to update; repeatable.',
    },
    fetch: {
      kind: 'boolean',
      negatable: true,
      help: 'Fetch before measuring. --no-fetch measures the refs as they stand.',
    },
    drafts: {
      kind: 'boolean',
      negatable: true,
      help: 'Include draft PRs. --no-drafts excludes them.',
    },
    limit: {
      kind: 'string',
      valueName: 'n',
      default: '100',
      help: 'Maximum open PRs per repository.',
    },
    remote: {
      kind: 'string',
      valueName: 'name',
      default: 'origin',
      help: 'Remote to measure against and push to.',
    },
    apply: { kind: 'boolean', help: 'Push the updates. Without it, nothing is written.' },
    confirmPush: {
      kind: 'boolean',
      help: 'Show the commits and diffstat and ask y/N before each force-push. Needs --apply and a terminal.',
    },
    pr: { kind: 'list', valueName: 'n', default: [], help: 'Update only this PR; repeatable.' },
    branch: {
      kind: 'string',
      valueName: 'name',
      help: BRANCH_HELP,
    },
    trust: {
      kind: 'boolean',
      help: 'Treat this repo as trusted for this run (satisfies the trust gate on commands and agents the project file names).',
    },
    retryFailed: {
      kind: 'boolean',
      help: 'Attempt PRs whose update already failed at their current head and base.',
    },
    repairAgent: {
      kind: 'enum',
      choices: REPAIR_AGENTS,
      valueName: 'agent',
      help: [
        'Repair a conflict no resolver claims, with a headless agent that only edits files:',
        ...REPAIR_AGENTS.map(
          (a) => `${REPAIR_AGENT_INDENT}${a.padEnd(7)}${REPAIR_AGENT_SUMMARIES[a]}`,
        ),
        `${REPAIR_AGENT_INDENT}Beats repair.agent and repair.command in config.`,
        `${REPAIR_AGENT_INDENT}Needs --apply; the CLI must be installed and signed in.`,
      ].join('\n'),
    },
    repairCommand: {
      kind: 'string',
      valueName: 'cmd',
      help: 'Repair a conflict no resolver claims by running this shell command in the update worktree (request as JSON on stdin). Beats repair.agent and repair.command in config; not with --repair-agent.',
    },
    strategy: {
      kind: 'enum',
      choices: ['rebase', 'merge'] as const,
      valueName: 'name',
      help: "Override this run's default strategy; does not beat a per-PR override or the unpushed-local guard.",
    },
    output: {
      kind: 'enum',
      choices: ['text', 'json'] as const,
      valueName: 'form',
      help: 'text (aligned) or json. Default: text',
    },
    json: { kind: 'boolean', help: 'alias for --output json' },
    report: {
      kind: 'string',
      valueName: 'file',
      help: 'Also write the result as JSON to this file, atomically, whatever the exit code. A run that throws writes {"error": message} instead; any report from an earlier run is removed first.',
    },
  },
})

const TOP_HELP = `pr-update <command>

Commands:
  survey   Report every open PR's drift from its base, in stack order.
  update   Bring out-of-date PRs up to date, in stack order.
  config   List, read, edit and explain the pr_update and code_host config.
  trust    Record consent to run the commands this repository's config names.

Run 'pr-update <command> --help' for a command's own flags.`

/** What a test substitutes for the real `gh`, or a host re-points; production runs pass none. */
export interface CliSeams {
  gh?: CommandRunner
  git?: CommandRunner
  /** Runs `curl` for a Forgejo code host. */
  curl?: CommandRunner
  /** Finds a binary on PATH, for the check that the run's tools are installed. */
  which?: WhichSeam
  /** The config file to read instead of {@link PR_UPDATE_CONFIG_FILE}. */
  configFile?: ConfigFileSpec
}

function runEnv(
  ctx: CliContext,
  layers: ReturnType<typeof loadConfigLayers>,
  seams: CliSeams,
  repairFlags: { agent: RepairAgent | null; command: string | null } = {
    agent: null,
    command: null,
  },
): UpdateEnv {
  const git = seams.git ?? spawnRunner('git')
  const gh = seams.gh ?? spawnRunner('gh')
  const projectRoot = ctx.cwd
  const loaded = layers.merged.pr_update
  const cfg =
    repairFlags.agent === null && repairFlags.command === null
      ? loaded
      : { ...loaded, repair: { ...loaded.repair, ...repairFlags } }
  return {
    projectRoot,
    dryRun: false,
    git,
    gh,
    codeHost: selectedCodeHostFor({
      git,
      gh,
      curl: seams.curl,
      override: layers.merged.code_host.override,
    }),
    cfg,
    ports: standalonePorts(cfg, projectRoot),
  }
}

/** Check the run's tools, remote and code host before any PR is listed. */
function checkStart(
  ctx: CliContext,
  layers: ReturnType<typeof loadConfigLayers>,
  seams: CliSeams,
  scope: { remote: string; repo: readonly string[] },
): { host: CodeHostName } | { failure: PreflightFailure } {
  const r = preflight({
    cwd: ctx.cwd,
    git: seams.git ?? spawnRunner('git'),
    remote: scope.remote,
    repoGiven: scope.repo.length > 0,
    override: layers.merged.code_host.override,
    which: seams.which,
  })
  return r.ok ? { host: r.host } : { failure: r.failure }
}

/**
 * The message and exit code for a code-host failure a run threw, or null for
 * any other error. A failed listing names the repository and the host's usual
 * remedy; an adapter that could not be built carries its own reason.
 */
function codeHostFailure(e: unknown, host: CodeHostName): PreflightFailure | null {
  if (e instanceof PrListError) {
    return {
      exit: EXIT_CODE_HOST,
      message: `pr-update could not list pull requests for ${e.slug}: ${listingHint(host)}`,
    }
  }
  if (e instanceof CodeHostSetupError) {
    const tokenMissing = e.message.includes('is not set')
    return {
      exit: EXIT_CODE_HOST,
      message: tokenMissing
        ? `pr-update needs a Forgejo token: set ${FORGEJO_TOKEN_ENV} (${e.message}).`
        : `pr-update could not set up the code host: ${e.message}.`,
    }
  }
  return null
}

function runSurveyCommand(argv: readonly string[], ctx: CliContext, seams: CliSeams): number {
  const { io } = ctx
  const expanded = expandBranchFlag(argv, ctx.cwd)
  if ('error' in expanded) {
    // A bare `--branch` asks git for the current branch; with git missing say so.
    const noGit = gitMissingFailure(ctx.cwd, seams.which)
    if (noGit !== null) {
      io.stderr(`${noGit.message}\n`)
      return noGit.exit
    }
    io.stderr(`pr-update survey: ${expanded.error}\n`)
    return EXIT.usage
  }
  const parsed = surveyCli.parse(expanded, io)
  if (parsed.status === 'help') return EXIT.ok
  if (parsed.status === 'error') {
    io.stderr(`pr-update survey: ${parsed.message}\n`)
    return EXIT.usage
  }
  const v = parsed.values
  const limit = parseIntFlag('limit', v.limit)
  if (typeof limit !== 'number') {
    io.stderr(`pr-update survey: ${limit.error}\n`)
    return EXIT.usage
  }
  const prNumbers = parsePrFlags(v.pr)
  if ('error' in prNumbers) {
    io.stderr(`pr-update survey: ${prNumbers.error}\n`)
    return EXIT.usage
  }
  const layers = loadConfigLayers(seams.configFile ?? PR_UPDATE_CONFIG_FILE, ctx.cwd, {
    env: ctx.env,
    cwd: ctx.cwd,
  })
  const start = checkStart(ctx, layers, seams, v)
  if ('failure' in start) {
    io.stderr(`${start.failure.message}\n`)
    return start.failure.exit
  }
  const env = runEnv(ctx, layers, seams)
  let report
  try {
    report = runSurvey(
      {
        ...(v.author !== undefined ? { author: v.author } : {}),
        pr: prNumbers.numbers,
        ...(v.branch !== undefined ? { branch: v.branch } : {}),
        repo: v.repo,
        noFetch: !v.fetch,
        noDrafts: !v.drafts,
        limit,
        remote: v.remote,
      },
      env,
    )
  } catch (e) {
    const hostFailure = codeHostFailure(e, start.host)
    if (hostFailure !== null) {
      io.stderr(`${hostFailure.message}\n`)
      return hostFailure.exit
    }
    if (!(e instanceof SurveyUsageError)) throw e
    io.stderr(`pr-update survey: ${e.message}\n`)
    return EXIT.usage
  }
  io.stdout(
    resolveOutput(v) === 'json' ? `${JSON.stringify(report, null, 2)}\n` : renderSurveyText(report),
  )
  return EXIT.ok
}

/**
 * Write `out` as JSON through a temp file and a rename, so a host reading the
 * report never sees half of one. Written for every run that produced a result,
 * whether it ended clean or left a conflict or failure.
 */
function writeReport(file: string, out: UpdateOutput): void {
  mkdirSync(dirname(file), { recursive: true })
  atomicWrite(file, `${JSON.stringify(updateOutputSchema.parse(out), null, 2)}\n`)
}

/** What `--report` holds when the run threw before producing a result. */
export function writeErrorReport(file: string, e: unknown): void {
  mkdirSync(dirname(file), { recursive: true })
  const error = e instanceof Error ? e.message : String(e)
  atomicWrite(file, `${JSON.stringify({ error }, null, 2)}\n`)
}

async function runUpdateCommand(
  argv: readonly string[],
  ctx: CliContext,
  seams: CliSeams,
): Promise<number> {
  const { io } = ctx
  const expanded = expandBranchFlag(argv, ctx.cwd)
  if ('error' in expanded) {
    // A bare `--branch` asks git for the current branch; with git missing say so.
    const noGit = gitMissingFailure(ctx.cwd, seams.which)
    if (noGit !== null) {
      io.stderr(`${noGit.message}\n`)
      return noGit.exit
    }
    io.stderr(`pr-update update: ${expanded.error}\n`)
    return EXIT.usage
  }
  const parsed = updateCli.parse(expanded, io)
  if (parsed.status === 'help') return EXIT.ok
  if (parsed.status === 'error') {
    io.stderr(`pr-update update: ${parsed.message}\n`)
    return EXIT.usage
  }
  const v = parsed.values
  // A report left by an earlier run must not be mistaken for this run's.
  const reportFile = v.report === undefined ? undefined : resolve(ctx.cwd, v.report)
  if (reportFile !== undefined) {
    try {
      rmSync(reportFile, { force: true })
    } catch (e) {
      io.stderr(`pr-update update: cannot clear the report ${v.report}: ${(e as Error).message}\n`)
      return EXIT.error
    }
  }
  const limit = parseIntFlag('limit', v.limit)
  if (typeof limit !== 'number') {
    io.stderr(`pr-update update: ${limit.error}\n`)
    return EXIT.usage
  }
  const prNumbers = parsePrFlags(v.pr)
  if ('error' in prNumbers) {
    io.stderr(`pr-update update: ${prNumbers.error}\n`)
    return EXIT.usage
  }
  const layers = loadConfigLayers(seams.configFile ?? PR_UPDATE_CONFIG_FILE, ctx.cwd, {
    env: ctx.env,
    cwd: ctx.cwd,
  })
  if (v.repairAgent !== undefined && v.repairCommand !== undefined) {
    io.stderr('pr-update update: --repair-agent and --repair-command are mutually exclusive\n')
    return EXIT.usage
  }
  // A repair chosen on the command line is the person's own consent and
  // replaces whatever the project file names, which then never runs.
  const repairFlag = v.repairAgent !== undefined || v.repairCommand !== undefined
  const refusal = await untrustedMessage({
    root: ctx.cwd,
    project: repairFlag ? withoutRepairChoice(layers.project) : layers.project,
    local: layers.local,
    trust: v.trust,
    env: ctx.env,
  })
  if (refusal !== null) {
    io.stderr(`pr-update update: ${refusal}\n`)
    return EXIT_UNTRUSTED
  }
  const start = checkStart(ctx, layers, seams, v)
  if ('failure' in start) {
    io.stderr(`${start.failure.message}\n`)
    return start.failure.exit
  }
  const env: UpdateEnv = runEnv(ctx, layers, seams, {
    agent: v.repairAgent ?? null,
    command: v.repairCommand ?? null,
  })
  let out
  try {
    out = await runUpdate(
      {
        ...(v.author !== undefined ? { author: v.author } : {}),
        repo: v.repo,
        noFetch: !v.fetch,
        noDrafts: !v.drafts,
        limit,
        remote: v.remote,
        apply: v.apply,
        confirmPush: v.confirmPush,
        pr: prNumbers.numbers,
        ...(v.branch !== undefined ? { branch: v.branch } : {}),
        trust: v.trust,
        retryFailed: v.retryFailed,
        ...(v.strategy !== undefined ? { strategy: v.strategy } : {}),
      },
      env,
    )
  } catch (e) {
    const hostFailure = codeHostFailure(e, start.host)
    if (reportFile !== undefined) {
      try {
        writeErrorReport(reportFile, hostFailure === null ? e : new Error(hostFailure.message))
      } catch {
        // The original error is the one worth surfacing.
      }
    }
    if (hostFailure !== null) {
      io.stderr(`${hostFailure.message}\n`)
      return hostFailure.exit
    }
    if (!(e instanceof SurveyUsageError)) throw e
    io.stderr(`pr-update update: ${e.message}\n`)
    return EXIT.usage
  }
  if (reportFile !== undefined) {
    try {
      writeReport(reportFile, out)
    } catch (e) {
      io.stderr(`pr-update update: cannot write the report ${v.report}: ${(e as Error).message}\n`)
      return EXIT.error
    }
  }
  io.stdout(
    resolveOutput(v) === 'json' ? `${JSON.stringify(out, null, 2)}\n` : renderUpdateText(out),
  )
  // Exit `1` is a well-formed command that failed against the state it found:
  // the run itself completed (every target was at least attempted and nothing
  // was left half-applied), but a conflict or push failure means some PR did
  // not end up updated. A script driving this in a loop needs that distinction
  // in its exit code, not just in the JSON `counts`.
  return out.counts.conflict > 0 || out.counts.failed > 0 ? EXIT.error : EXIT.ok
}

async function runTrustCommand(argv: readonly string[], ctx: CliContext): Promise<number> {
  const { io } = ctx
  if (argv.length > 0) {
    io.stderr(`pr-update trust: takes no arguments\n`)
    return EXIT.usage
  }
  const r = await prUpdateTrustStore(ctx.env).trust(ctx.cwd)
  io.stdout(`${r.alreadyTrusted ? 'already trusted' : 'trusted'}: ${r.root}\n`)
  return EXIT.ok
}

/** `main(argv, ctx)`: returns, never exits, reads nothing ambient. */
export async function main(
  argv: readonly string[],
  ctx: CliContext,
  seams: CliSeams = {},
): Promise<number> {
  try {
    return await dispatch(argv, ctx, seams)
  } catch (e) {
    if (!(e instanceof ConfigInvalidError)) throw e
    ctx.io.stderr(`pr-update: ${e.message}\n`)
    return CONFIG_INVALID_EXIT
  }
}

async function dispatch(
  argv: readonly string[],
  ctx: CliContext,
  seams: CliSeams,
): Promise<number> {
  const [sub, ...rest] = argv
  if (sub === undefined || sub === '--help' || sub === '-h') {
    ctx.io.stdout(`${TOP_HELP}\n`)
    return EXIT.ok
  }
  if (sub === 'survey') return runSurveyCommand(rest, ctx, seams)
  if (sub === 'update') return runUpdateCommand(rest, ctx, seams)
  if (sub === 'config')
    return runConfigCommand(rest, ctx, seams.configFile ?? PR_UPDATE_CONFIG_FILE)
  if (sub === 'trust') return runTrustCommand(rest, ctx)
  ctx.io.stderr(`pr-update: unknown command '${sub}'\n\n${TOP_HELP}\n`)
  return EXIT.usage
}
