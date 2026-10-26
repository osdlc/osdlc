/**
 * `pr-update`: the standalone CLI.
 *
 * The subcommands `survey` and `update` are each declared to `defineCli`
 * separately. `defineCli` has no subcommands, so the dispatch on `argv[0]`
 * below does that job. `config` and `trust` are `@osdlc/cli-tool`'s shared
 * commands, the same as every tool built on it has, run as a command tree of
 * their own (see `config-cli.ts`).
 *
 * Config layers, highest first: a flag, `pr-update.local.yaml`,
 * `pr-update.yaml` (the `pr_update:` and `code_host:` blocks), the built-in
 * defaults (see `config-file.ts`). `PR_UPDATE_CONFIG` points the two files at
 * another path. Every `PrUpdateConfig` key has a default, so `survey` and
 * `update` work with no config file. The binary reads no other file. `config`
 * reads and edits those files, and `trust` records consent to the commands a
 * project's config names.
 *
 * Exit codes:
 *
 * - `0`: a clean run. `survey` always; `update` when every target ended
 *   `updated`, `up-to-date` or skipped on purpose.
 * - `1`: the command ran but did not fully succeed. Either an unexpected error
 *   (caught by `runMain`), or, for `update`, a target left `conflict` or
 *   `failed` (`results` and `counts` say which).
 * - `2`: a malformed command line.
 * - `14`: the config file is invalid or unreadable.
 * - `21`: `update` was refused because the repository is not trusted.
 * - `22` to `25`: the codes every `@osdlc/cli-tool` tool shares
 *   (`EXIT_FAILURE`). `22`: a tool the run needs (`git`, and `gh` or `curl`)
 *   is not installed. `23`: the code host refused the caller or answered
 *   unusably (not signed in, no Forgejo token, not found). `24`: there is no
 *   repository or git remote to read. `25`: the code host could not be
 *   reached or rate-limited the caller.
 *
 * `selectCodeHost` chooses the code host from the `origin` remote, or from
 * `code_host.override`, whatever `--remote` names. `--remote` is the remote
 * fetched, measured against (`<remote>/<branch>`) and, for `update`, pushed to.
 * A failed PR listing is an error, never "no open PRs". `@osdlc/cli-tool` prints every classified failure and picks its exit code.
 */

import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { atomicWrite } from '@osdlc/etag-write'
import { EXIT, defineCli, failWith, failureOf, renderError, type CliContext } from '@osdlc/cli-tool'
import { defineApp, type App } from '@osdlc/cli-tool/command'
import { trustCommand, type TrustService } from '@osdlc/cli-tool/trust-command'
import { spawnRunner, type CommandRunner } from '@osdlc/command-seam'
import { describe, type Failure } from '@osdlc/result'
import { Git } from '@osdlc/typed-git'
import { CONFIG_INVALID_EXIT, ConfigInvalidError, type ConfigFileSpec } from '@osdlc/config-layers'

import { selectedCodeHostFor } from './code-host.ts'
import { configCommand } from './config-cli.ts'
import { loadConfigLayers } from './config-file.ts'
import { standalonePorts } from './defaults.ts'
import { gitMissingFailure, preflight, type WhichSeam } from './preflight.ts'
import { REPAIR_AGENTS, REPAIR_AGENT_SUMMARIES, type RepairAgent } from './repair/names.ts'
import { SurveyUsageError, renderSurveyText, repoFailuresOf, runSurvey } from './survey.ts'
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
 * The flag parser has no flag with an optional value. So when `--branch` ends
 * the line or is followed by another flag, the current branch is inserted as
 * its value. Returns `{ error }` when the checkout is not on a branch.
 */
function expandBranchFlag(argv: readonly string[], cwd: string): string[] | { error: string } {
  const out: string[] = []
  for (const [i, arg] of argv.entries()) {
    out.push(arg)
    if (arg !== '--branch') continue
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('-')) continue
    const runner = spawnRunner('git', { absolutePathOnly: true })
    const current = new Git(cwd, { runner }).soft.currentBranch()
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
      help: 'Remote to fetch from and measure against.',
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
      help: 'Remote to fetch from, measure against and push to.',
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

/** Replacements for the real tools and config file, for a test or a host. A normal run passes none. */
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
  // Both run in the project, so a bare name runs only from an absolute PATH entry.
  const git = seams.git ?? spawnRunner('git', { absolutePathOnly: true })
  const gh = seams.gh ?? spawnRunner('gh', { absolutePathOnly: true })
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
): Failure | null {
  return preflight({
    cwd: ctx.cwd,
    git: seams.git ?? spawnRunner('git', { absolutePathOnly: true }),
    remote: scope.remote,
    repoGiven: scope.repo.length > 0,
    override: layers.merged.code_host.override,
    which: seams.which,
  })
}

function runSurveyCommand(argv: readonly string[], ctx: CliContext, seams: CliSeams): number {
  const { io } = ctx
  const expanded = expandBranchFlag(argv, ctx.cwd)
  if ('error' in expanded) {
    // A bare `--branch` asks git for the current branch, so report a missing git first.
    const noGit = gitMissingFailure(ctx.cwd, seams.which)
    if (noGit !== null) return failWith(ctx, noGit, { name: 'pr-update' })
    io.stderr(renderError(expanded.error, 'pr-update survey'))
    return EXIT.usage
  }
  const parsed = surveyCli.parse(expanded, io)
  if (parsed.status === 'help') return EXIT.ok
  if (parsed.status === 'error') {
    io.stderr(renderError(parsed.message, 'pr-update survey'))
    return EXIT.usage
  }
  const v = parsed.values
  const limit = parseIntFlag('limit', v.limit)
  if (typeof limit !== 'number') {
    io.stderr(renderError(limit.error, 'pr-update survey'))
    return EXIT.usage
  }
  const prNumbers = parsePrFlags(v.pr)
  if ('error' in prNumbers) {
    io.stderr(renderError(prNumbers.error, 'pr-update survey'))
    return EXIT.usage
  }
  const layers = loadConfigLayers(seams.configFile ?? PR_UPDATE_CONFIG_FILE, ctx.cwd, {
    env: ctx.env,
    cwd: ctx.cwd,
  })
  const unready = checkStart(ctx, layers, seams, v)
  if (unready !== null) return failWith(ctx, unready, { name: 'pr-update' })
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
    // `main` prints a classified failure (a failed listing) and picks its exit code.
    if (!(e instanceof SurveyUsageError)) throw e
    io.stderr(renderError(e.message, 'pr-update survey'))
    return EXIT.usage
  }
  io.stdout(
    resolveOutput(v) === 'json' ? `${JSON.stringify(report, null, 2)}\n` : renderSurveyText(report),
  )
  return reportRepoFailures(ctx, report) ?? EXIT.ok
}

/**
 * Print each repository of a several-repository run that could not be listed,
 * and return the exit code of the first, or null when none failed. The other
 * repositories were surveyed, and their rows do not hide the failure.
 */
function reportRepoFailures(
  ctx: CliContext,
  report: Parameters<typeof repoFailuresOf>[0],
): number | null {
  let code: number | null = null
  for (const failure of repoFailuresOf(report)) {
    const exit = failWith(ctx, failure, { name: 'pr-update' })
    code ??= exit
  }
  return code
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

/**
 * What `--report` holds when the run threw before producing a result:
 * `{ error }`, and for a classified failure also `{ failure: { kind, message,
 * hint } }`, so a script can branch on the kind without parsing the sentence.
 */
export function writeErrorReport(file: string, e: unknown): void {
  mkdirSync(dirname(file), { recursive: true })
  const failure = failureOf(e)
  const report =
    failure === null
      ? { error: e instanceof Error ? e.message : String(e) }
      : {
          error: describe(failure),
          failure: {
            kind: failure.kind,
            message: failure.message,
            ...(failure.hint === undefined ? {} : { hint: failure.hint }),
          },
        }
  atomicWrite(file, `${JSON.stringify(report, null, 2)}\n`)
}

async function runUpdateCommand(
  argv: readonly string[],
  ctx: CliContext,
  seams: CliSeams,
): Promise<number> {
  const { io } = ctx
  const expanded = expandBranchFlag(argv, ctx.cwd)
  if ('error' in expanded) {
    // A bare `--branch` asks git for the current branch, so report a missing git first.
    const noGit = gitMissingFailure(ctx.cwd, seams.which)
    if (noGit !== null) return failWith(ctx, noGit, { name: 'pr-update' })
    io.stderr(renderError(expanded.error, 'pr-update update'))
    return EXIT.usage
  }
  const parsed = updateCli.parse(expanded, io)
  if (parsed.status === 'help') return EXIT.ok
  if (parsed.status === 'error') {
    io.stderr(renderError(parsed.message, 'pr-update update'))
    return EXIT.usage
  }
  const v = parsed.values
  // A report left by an earlier run must not be mistaken for this run's.
  const reportFile = v.report === undefined ? undefined : resolve(ctx.cwd, v.report)
  if (reportFile !== undefined) {
    try {
      rmSync(reportFile, { force: true })
    } catch (e) {
      io.stderr(
        renderError(
          `cannot clear the report ${v.report}: ${(e as Error).message}`,
          'pr-update update',
        ),
      )
      return EXIT.error
    }
  }
  const limit = parseIntFlag('limit', v.limit)
  if (typeof limit !== 'number') {
    io.stderr(renderError(limit.error, 'pr-update update'))
    return EXIT.usage
  }
  const prNumbers = parsePrFlags(v.pr)
  if ('error' in prNumbers) {
    io.stderr(renderError(prNumbers.error, 'pr-update update'))
    return EXIT.usage
  }
  const layers = loadConfigLayers(seams.configFile ?? PR_UPDATE_CONFIG_FILE, ctx.cwd, {
    env: ctx.env,
    cwd: ctx.cwd,
  })
  if (v.repairAgent !== undefined && v.repairCommand !== undefined) {
    io.stderr(
      renderError('--repair-agent and --repair-command are mutually exclusive', 'pr-update update'),
    )
    return EXIT.usage
  }
  // A repair chosen on the command line is the person's own consent. It
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
    io.stderr(renderError(refusal, 'pr-update update'))
    return EXIT_UNTRUSTED
  }
  const unready = checkStart(ctx, layers, seams, v)
  if (unready !== null) return failWith(ctx, unready, { name: 'pr-update' })
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
    if (reportFile !== undefined) {
      try {
        writeErrorReport(reportFile, e)
      } catch {
        // Report the original error, not this one.
      }
    }
    // `main` prints a classified failure (a failed listing) and picks its exit code.
    if (!(e instanceof SurveyUsageError)) throw e
    io.stderr(renderError(e.message, 'pr-update update'))
    return EXIT.usage
  }
  if (reportFile !== undefined) {
    try {
      writeReport(reportFile, out)
    } catch (e) {
      io.stderr(
        renderError(
          `cannot write the report ${v.report}: ${(e as Error).message}`,
          'pr-update update',
        ),
      )
      return EXIT.error
    }
  }
  io.stdout(
    resolveOutput(v) === 'json' ? `${JSON.stringify(out, null, 2)}\n` : renderUpdateText(out),
  )
  // Exit `1` means the command was well formed and the run completed: every
  // target was attempted and nothing was left half applied. But a conflict or
  // push failure left some PR not updated. A script that runs this in a loop
  // needs that in the exit code, not only in the JSON `counts`.
  const listingFailure = reportRepoFailures(ctx, {
    repos: (out.repoFailures ?? []).map(({ repo, ...failure }) => ({
      slug: repo,
      measurable: false,
      fetched: false,
      failure,
    })),
  })
  if (listingFailure !== null) return listingFailure
  return out.counts.conflict > 0 || out.counts.failed > 0 ? EXIT.error : EXIT.ok
}

/** The whole-repository marker `pr-update trust` records, keyed on the working directory. */
const trustService: TrustService = {
  async trust(ctx) {
    const r = await prUpdateTrustStore(ctx.env).trust(ctx.cwd)
    return { root: r.root, trusted: true, by: 'marker', changed: !r.alreadyTrusted }
  },
  async untrust(ctx) {
    const store = prUpdateTrustStore(ctx.env)
    const root = await store.resolveRoot(ctx.cwd)
    const removed = await store.untrust(root)
    return { root, trusted: false, by: null, changed: removed }
  },
  async show(ctx) {
    const store = prUpdateTrustStore(ctx.env)
    const root = await store.resolveRoot(ctx.cwd)
    const trusted = await store.isTrusted(root)
    return { root, trusted, by: trusted ? 'marker' : null }
  },
  async list(ctx) {
    const roots = await prUpdateTrustStore(ctx.env).list()
    return roots.map((root) => ({ root, trusted: true, by: 'marker' }))
  },
}

/** pr-update's version, from its package.json: `src/` and `dist/` both sit one level below it. */
function packageVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version?: string
  }
  return pkg.version ?? '0.0.0'
}

/** The tree `config` and `trust` run in: cli-tool's shared commands over pr-update's files. */
function sharedCommands(file: ConfigFileSpec): App {
  return defineApp({
    name: 'pr-update',
    version: packageVersion(),
    summary: 'Survey and update out-of-date, stacked pull requests.',
    commands: {
      config: configCommand(file),
      trust: trustCommand(trustService, {
        summary: "record consent to run the commands this repository's config names",
        description:
          'The project file can name commands pr-update runs (lockfile_install, resolvers, ' +
          'repair.command, repair.agent, test_command). A setting the repository writes cannot ' +
          'authorize running it, so update refuses them (exit 21) until the repository is ' +
          'trusted. Trust is kept outside the repository, keyed on its resolved path. ' +
          '--trust on update allows one run without recording anything.',
      }),
    },
  })
}

/** `main(argv, ctx)`: returns an exit code and never exits. It reads nothing outside `ctx` and `seams`. */
export async function main(
  argv: readonly string[],
  ctx: CliContext,
  seams: CliSeams = {},
): Promise<number> {
  try {
    return await dispatch(argv, ctx, seams)
  } catch (e) {
    if (e instanceof ConfigInvalidError) {
      ctx.io.stderr(renderError(e.message, 'pr-update'))
      return CONFIG_INVALID_EXIT
    }
    // A classified failure (a missing tool, a failed listing) gets the shared
    // message and exit code. Anything else is a bug and goes to `runMain`.
    const failure = failureOf(e)
    if (failure !== null) return failWith(ctx, failure, { name: 'pr-update' })
    throw e
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
  if (sub === 'config' || sub === 'trust') {
    return sharedCommands(seams.configFile ?? PR_UPDATE_CONFIG_FILE).run(argv, ctx)
  }
  ctx.io.stderr(`${renderError(`unknown command '${sub}'`, 'pr-update')}\n${TOP_HELP}\n`)
  return EXIT.usage
}
