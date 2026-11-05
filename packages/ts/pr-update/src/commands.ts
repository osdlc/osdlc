/**
 * `pr-update survey` and `pr-update update`, declared once on
 * `@osdlc/cli-tool`'s command model. Each command declares its flags, its exit
 * codes and its output schema (`survey.ts` and `update.ts` own the schemas);
 * the app in `cli.ts` parses the command line, prints the answer as text or,
 * under `--json`, as one document with `schemaVersion` and `kind`, and
 * generates `--help` and `schema` from the same declarations.
 *
 * Each command loads the config layers, checks the run's tools before any PR
 * is listed (`preflight.ts`), and runs the engine. An invalid config is a
 * {@link CommandError} with exit 14, a run refused for want of trust exit 21,
 * and a classified failure (a missing tool, a failed listing) is thrown so the
 * app prints it and exits with its shared code (22 to 25).
 */

import { mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { atomicWrite } from '@osdlc/etag-write'
import { EXIT, failWith, failureOf, type CliContext } from '@osdlc/cli-tool'
import {
  CommandError,
  UsageError,
  defineCommand,
  outcome,
  type CommandContext,
} from '@osdlc/cli-tool/command'
import { spawnRunner, type CommandRunner } from '@osdlc/command-seam'
import { describe, type Failure } from '@osdlc/result'
import { Git } from '@osdlc/typed-git'
import { CONFIG_INVALID_EXIT, ConfigInvalidError, type ConfigFileSpec } from '@osdlc/config-layers'

import { selectedCodeHostFor } from './code-host.ts'
import { loadConfigLayers } from './config-file.ts'
import { standalonePorts } from './defaults.ts'
import { gitMissingFailure, preflight, type WhichSeam } from './preflight.ts'
import { REPAIR_AGENTS, REPAIR_AGENT_SUMMARIES, type RepairAgent } from './repair/names.ts'
import {
  SurveyUsageError,
  output as surveyOutputSchema,
  renderSurveyText,
  repoFailuresOf,
  runSurvey,
} from './survey.ts'
import { EXIT_UNTRUSTED, untrustedMessage, withoutRepairChoice } from './trust.ts'
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

/** The schema version of the `survey` and `update` documents. */
const SCHEMA_VERSION = 1

/** The `kind` of the document `survey --json` prints. */
const SURVEY_KIND = 'survey'

/** The `kind` of the document `update --json` prints, and of the `--report` file. */
const UPDATE_KIND = 'update'

const BRANCH_HELP =
  'Only the PR whose head is this branch. A bare --branch (no name) means the branch checked out in the current directory. No such PR is a usage error.'

/** The flags `survey` and `update` both take. `repo` and `remote` say what the command does with them. */
function scopeFlags(verb: 'survey' | 'update', remoteHelp: string) {
  return {
    author: {
      kind: 'string',
      valueName: 'login',
      help: 'Only PRs by this author (`@me` for yourself).',
    },
    repo: {
      kind: 'list',
      valueName: 'owner/name',
      default: [],
      help: `Repository to ${verb}; repeatable.`,
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
      help: remoteHelp,
    },
    branch: { kind: 'string', valueName: 'name', help: BRANCH_HELP },
    currentBranch: {
      kind: 'boolean',
      hidden: true,
      help: 'Only the PR whose head is the branch checked out in the current directory: what a bare --branch means.',
    },
  } as const
}

function parseIntFlag(name: string, raw: string): number {
  const n = Number(raw)
  if (!Number.isInteger(n)) throw new UsageError(`--${name} must be an integer, got '${raw}'`)
  return n
}

function parsePrFlags(raw: readonly string[]): number[] {
  return raw.map((text) => parseIntFlag('pr', text))
}

/**
 * The branch the run is scoped to: `--branch <name>`, or with
 * `--current-branch` (a bare `--branch`) the branch checked out in `cwd`.
 * A bare `--branch` asks git, so a missing git is reported before the
 * detached HEAD it would otherwise look like.
 */
function branchOf(
  flags: { branch?: string | undefined; currentBranch: boolean },
  cwd: string,
  seams: CliSeams,
): string | undefined {
  if (!flags.currentBranch) return flags.branch
  if (flags.branch !== undefined) throw new UsageError('--branch names one branch; give it once')
  const noGit = gitMissingFailure(cwd, seams.which)
  if (noGit !== null) throw noGit
  const runner = seams.git ?? spawnRunner('git', { absolutePathOnly: true })
  const current = new Git(cwd, { runner }).soft.currentBranch()
  if (current === null || current === '') {
    throw new UsageError('--branch needs a branch name: this directory is not on a branch')
  }
  return current
}

/** The config layers, with an invalid or unreadable file as the command's failure: exit 14. */
function loadLayers(ctx: CliContext, seams: CliSeams): ReturnType<typeof loadConfigLayers> {
  try {
    return loadConfigLayers(seams.configFile ?? PR_UPDATE_CONFIG_FILE, ctx.cwd, {
      env: ctx.env,
      cwd: ctx.cwd,
    })
  } catch (err) {
    if (err instanceof ConfigInvalidError) {
      throw new CommandError(err.message, { exit: CONFIG_INVALID_EXIT, code: 'config-invalid' })
    }
    throw err
  }
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

/**
 * Check the run's tools, remote and code host before any PR is listed. A
 * problem is thrown, so the app prints it and exits with its kind's code.
 */
function checkStart(
  ctx: CliContext,
  layers: ReturnType<typeof loadConfigLayers>,
  seams: CliSeams,
  scope: { remote: string; repo: readonly string[] },
): void {
  const unready = preflight({
    cwd: ctx.cwd,
    git: seams.git ?? spawnRunner('git', { absolutePathOnly: true }),
    remote: scope.remote,
    repoGiven: scope.repo.length > 0,
    override: layers.merged.code_host.override,
    which: seams.which,
  })
  if (unready !== null) throw unready
}

/**
 * Print each repository of a several-repository run that could not be listed,
 * and return the exit code of the first, or null when none failed. The other
 * repositories were surveyed, and their rows do not hide the failure.
 */
function reportRepoFailures(
  ctx: CommandContext,
  report: Parameters<typeof repoFailuresOf>[0],
): number | null {
  let code: number | null = null
  for (const failure of repoFailuresOf(report)) {
    const exit = failWith(ctx, failure, { name: ctx.app.name })
    code ??= exit
  }
  return code
}

/** A thrown {@link SurveyUsageError} (no PR for `--branch`, a bad flag pairing) as a usage error. */
function asUsage(e: unknown): never {
  if (e instanceof SurveyUsageError) throw new UsageError(e.message)
  throw e
}

/** The `survey` command over `seams`. */
export function surveyCommand(seams: CliSeams) {
  return defineCommand({
    summary: "Report every open PR's drift from its base, in stack order.",
    description:
      'Lists the open PRs of the repository (or each --repo), measures how far each is behind ' +
      'its base with the local refs, and predicts with git merge-tree whether bringing it up to ' +
      'date would conflict. Stacked PRs are listed parent first. Nothing is checked out, and ' +
      'nothing is written but the fetch.',
    flags: {
      ...scopeFlags('survey', 'Remote to fetch from and measure against.'),
      pr: {
        kind: 'list',
        valueName: 'n',
        default: [],
        help: 'Only this PR and its stack parents; repeatable.',
      },
    },
    exits: { 14: 'the config file is invalid or unreadable' },
    examples: ['survey', 'survey --branch --no-fetch', 'survey --repo acme/widgets --json'],
    output: surveyOutputSchema,
    kind: SURVEY_KIND,
    schemaVersion: SCHEMA_VERSION,
    readOnly: true,
    run({ flags }, ctx) {
      const branch = branchOf(flags, ctx.cwd, seams)
      const limit = parseIntFlag('limit', flags.limit)
      const pr = parsePrFlags(flags.pr)
      const layers = loadLayers(ctx, seams)
      checkStart(ctx, layers, seams, flags)
      const env = runEnv(ctx, layers, seams)
      let report
      try {
        report = runSurvey(
          {
            ...(flags.author !== undefined ? { author: flags.author } : {}),
            pr,
            ...(branch !== undefined ? { branch } : {}),
            repo: flags.repo,
            noFetch: !flags.fetch,
            noDrafts: !flags.drafts,
            limit,
            remote: flags.remote,
          },
          env,
        )
      } catch (e) {
        // A classified failure (a failed listing) goes to the app, which prints it.
        asUsage(e)
      }
      const failed = reportRepoFailures(ctx, report)
      return failed === null ? report : outcome(report, failed)
    },
    text: (report) => renderSurveyText(report as Parameters<typeof renderSurveyText>[0]),
  })
}

/**
 * The document `update --json` prints, and `--report` writes: the output
 * with `schemaVersion` and `kind` in front.
 */
function updateDocument(out: UpdateOutput): Record<string, unknown> {
  return { schemaVersion: SCHEMA_VERSION, kind: UPDATE_KIND, ...updateOutputSchema.parse(out) }
}

/**
 * Write `out` as JSON through a temp file and a rename, so a host reading the
 * report never sees half of one. Written for every run that produced a result,
 * whether it ended clean or left a conflict or failure.
 */
function writeReport(file: string, out: UpdateOutput): void {
  mkdirSync(dirname(file), { recursive: true })
  atomicWrite(file, `${JSON.stringify(updateDocument(out), null, 2)}\n`)
}

/**
 * What `--report` holds when the run threw before producing a result:
 * `{ error }`, and for a classified failure also `{ failure: { kind, message,
 * hint } }`, so a script can branch on the kind without parsing the sentence.
 */
export function writeErrorReport(file: string, e: unknown): void {
  mkdirSync(dirname(file), { recursive: true })
  const failure: Failure | null = failureOf(e)
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

/** The agents `--repair-agent` takes, one line each, for the long help. */
const REPAIR_AGENT_LINES = REPAIR_AGENTS.map(
  (a) => `  ${a.padEnd(8)}${REPAIR_AGENT_SUMMARIES[a]}`,
).join('\n')

/** The `update` command over `seams`. */
export function updateCommand(seams: CliSeams) {
  return defineCommand({
    summary: 'Bring out-of-date PRs up to date, in stack order.',
    description:
      'Surveys as `survey` does, then rebases or merges each PR that is behind onto its base, ' +
      'parent first, in a worktree of its own. A conflict goes to the resolvers, then to the ' +
      'repair command or agent, and a PR that still conflicts is left as it was. Without ' +
      '--apply the run rehearses everything and pushes nothing.\n\n' +
      'The agents --repair-agent runs:\n' +
      REPAIR_AGENT_LINES,
    flags: {
      ...scopeFlags('update', 'Remote to fetch from, measure against and push to.'),
      apply: { kind: 'boolean', help: 'Push the updates. Without it, nothing is written.' },
      confirmPush: {
        kind: 'boolean',
        help: 'Show the commits and diffstat and ask y/N before each force-push. Needs --apply and a terminal.',
      },
      pr: { kind: 'list', valueName: 'n', default: [], help: 'Update only this PR; repeatable.' },
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
        help: 'Repair a conflict no resolver claims, with a headless agent that only edits files (each is listed under --help --all). Beats repair.agent and repair.command in config. Needs --apply; the CLI must be installed and signed in.',
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
      report: {
        kind: 'string',
        valueName: 'file',
        help: 'Also write the result as JSON to this file, atomically, whatever the exit code. A run that throws writes {"error": message} instead; any report from an earlier run is removed first.',
      },
    },
    exits: {
      1: 'a PR ended conflict or failed',
      14: 'the config file is invalid or unreadable',
      [EXIT_UNTRUSTED]: "refused: the repository's config names commands it is not trusted to run",
    },
    examples: [
      'update',
      'update --apply --strategy rebase',
      'update --branch --apply',
      'update --pr 12 --apply --report out.json',
    ],
    output: updateOutputSchema,
    kind: UPDATE_KIND,
    schemaVersion: SCHEMA_VERSION,
    destructive: true,
    // Consent given on the command line (trust for one run, a repair the
    // person names) is the person's own. An agent or a web page calling
    // through an adapter must not give it for them.
    exposureOf: ({ flags }) =>
      flags.trust === true || flags.repairAgent !== undefined || flags.repairCommand !== undefined
        ? 'cli-only'
        : 'all',
    async run({ flags }, ctx) {
      const branch = branchOf(flags, ctx.cwd, seams)
      // A report left by an earlier run must not be mistaken for this run's.
      const reportFile = flags.report === undefined ? undefined : resolve(ctx.cwd, flags.report)
      if (reportFile !== undefined) {
        try {
          rmSync(reportFile, { force: true })
        } catch (e) {
          throw new CommandError(`cannot clear the report ${flags.report}: ${(e as Error).message}`)
        }
      }
      const limit = parseIntFlag('limit', flags.limit)
      const pr = parsePrFlags(flags.pr)
      const layers = loadLayers(ctx, seams)
      if (flags.repairAgent !== undefined && flags.repairCommand !== undefined) {
        throw new UsageError('--repair-agent and --repair-command are mutually exclusive')
      }
      // A repair chosen on the command line is the person's own consent. It
      // replaces whatever the project file names, which then never runs.
      const repairFlag = flags.repairAgent !== undefined || flags.repairCommand !== undefined
      const refusal = await untrustedMessage({
        root: ctx.cwd,
        project: repairFlag ? withoutRepairChoice(layers.project) : layers.project,
        local: layers.local,
        trust: flags.trust,
        env: ctx.env,
      })
      if (refusal !== null) {
        throw new CommandError(refusal, { exit: EXIT_UNTRUSTED, code: 'untrusted' })
      }
      checkStart(ctx, layers, seams, flags)
      const env: UpdateEnv = runEnv(ctx, layers, seams, {
        agent: flags.repairAgent ?? null,
        command: flags.repairCommand ?? null,
      })
      let out: UpdateOutput
      try {
        out = await runUpdate(
          {
            ...(flags.author !== undefined ? { author: flags.author } : {}),
            repo: flags.repo,
            noFetch: !flags.fetch,
            noDrafts: !flags.drafts,
            limit,
            remote: flags.remote,
            apply: flags.apply,
            confirmPush: flags.confirmPush,
            pr,
            ...(branch !== undefined ? { branch } : {}),
            trust: flags.trust,
            retryFailed: flags.retryFailed,
            ...(flags.strategy !== undefined ? { strategy: flags.strategy } : {}),
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
        // A classified failure (a failed listing) goes to the app, which prints it.
        asUsage(e)
      }
      if (reportFile !== undefined) {
        try {
          writeReport(reportFile, out)
        } catch (e) {
          throw new CommandError(`cannot write the report ${flags.report}: ${(e as Error).message}`)
        }
      }
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
      const exit =
        listingFailure ?? (out.counts.conflict > 0 || out.counts.failed > 0 ? EXIT.error : EXIT.ok)
      return exit === EXIT.ok ? out : outcome(out, exit)
    },
    text: (out) => renderUpdateText(out as UpdateOutput),
  })
}
