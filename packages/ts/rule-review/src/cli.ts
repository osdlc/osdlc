/**
 * `rule-review`: review a changeset against the rule files that govern it.
 *
 * The standalone front door to this package. It needs nothing but a git repo:
 * the instruction-file provider reads the `CLAUDE.md` / `AGENTS.md` files
 * already there, so `rule-review` works in any checkout.
 *
 * It deliberately ships one provider. Any other rule corpus (a standards
 * tree, a house style registry) is a `RuleSourceProvider` supplied by
 * whatever owns that corpus, and teaching this binary about one would put that
 * knowledge in a package built to stay blind to it.
 *
 * `src/bin.ts` runs {@link main} as the program.
 */

import { BUILTIN_AGENTS } from '@osdlc/agent-call'
import { defineCli, processIo } from '@osdlc/cli-tool'

import { checksMain } from './checks-command.ts'
import {
  EXIT_CODE,
  fail,
  flagAsValue,
  helpAsked,
  interrupted,
  usage,
  withInterrupt,
} from './exit.ts'
import { exitCodeFor } from './findings.ts'
import { print, say } from './output.ts'
import { reviewChanges } from './review-changes.ts'
import { estimateTokens, formatTokens, jobLabel } from './tokens.ts'
import { DEFAULT_CONFIG, SEVERITY_ORDER, type ReviewConfig } from './types.ts'

/** The `kind` of the `--json` document, and its version. */
export const REVIEW_KIND = 'review'
const SCHEMA_VERSION = 1

const CLI = defineCli({
  name: 'rule-review',
  summary: `Review a changeset against the rule files that govern it.

Every CLAUDE.md / AGENTS.md governs its own directory. rule-review finds the
ones whose scope encloses a changed file and asks an agent about each one,
separately, over only the files it governs.`,
  flags: {
    base: {
      kind: 'string',
      valueName: 'ref',
      help: 'compare against <ref>. Default: uncommitted work only. A branch name reviews the whole branch, @{u} adds unpushed commits',
    },
    dryRun: {
      kind: 'boolean',
      help: 'show what would be judged, and what it would cost, without starting an agent',
    },
    blocking: { kind: 'boolean', help: 'exit 1 on findings at or above the severity floor' },
    severity: {
      kind: 'enum',
      valueName: 'level',
      choices: SEVERITY_ORDER,
      default: DEFAULT_CONFIG.severityFloor,
      help: 'the severity floor',
    },
    strict: {
      kind: 'boolean',
      help: 'exit 11 when a judgement could not complete (the agent failed, timed out, or gave no findings object)',
    },
    engine: {
      kind: 'enum',
      valueName: 'name',
      choices: BUILTIN_AGENTS,
      default: DEFAULT_CONFIG.engine,
      help: 'the agent that judges',
    },
    model: {
      kind: 'string',
      valueName: 'id',
      help: "model to judge with. Default: the engine's own",
    },
    concurrency: {
      kind: 'string',
      valueName: 'n',
      help: `judgements in flight at once. Default: ${DEFAULT_CONFIG.concurrency}`,
    },
    maxFiles: {
      kind: 'string',
      valueName: 'n',
      help: `files per judgement; a broader source is split into shards of this many files, judged against the same rules. 0 disables. Default: ${DEFAULT_CONFIG.maxFilesPerJob}`,
    },
    exclude: {
      kind: 'list',
      valueName: 'glob',
      commaSeparated: false,
      default: [],
      help: 'drop matching paths. Repeatable',
    },
    json: { kind: 'boolean', help: 'print the run as one JSON document on stdout' },
    dir: {
      kind: 'string',
      short: 'C',
      valueName: 'dir',
      help: 'run against <dir> instead of the current directory',
    },
  },
  epilogue: `Commands
  checks <folder>  Run a folder of numbered check scripts. See 'rule-review checks --help'.

Exit codes
  0    clean, or advisory (the default: findings are reported, not enforced)
  1    findings at or above the floor, with --blocking
  2    the command line cannot run as typed
  10   the run could not complete: a base that does not resolve, an unreadable
       pattern, a failing rule source provider
  11   a judgement did not complete, with --strict
  22   git is not installed
  24   the directory is not inside a git repository, or does not exist
  130  interrupted by SIGINT or SIGTERM; running agents are killed

rule-review --version prints the version.

Under --json a failure prints {"schemaVersion":1,"kind":"error",...} on stdout.`,
})

/** The usage text, as `--help` prints it. */
export function usageText(): string {
  return CLI.help()
}

/**
 * A whole decimal integer, or NaN. `parseInt` would read `1.5`, `1e2`,
 * `12abc` and `0x10` as their leading digits instead of rejecting them.
 */
function wholeNumber(v: string): number {
  return /^\d+$/.test(v) ? Number(v) : Number.NaN
}

interface Options {
  base?: string
  dryRun: boolean
  json: boolean
  strict: boolean
  cwd: string
  config: ReviewConfig
}

/** Read the command line into options, an error message, or `help` (already printed). */
function parse(argv: string[]): Options | 'help' | { error: string } {
  if (helpAsked(argv)) {
    print(CLI.help())
    return 'help'
  }
  const parsed = CLI.parse(argv, processIo)
  if (parsed.status === 'help') return 'help'
  if (parsed.status === 'error') return { error: parsed.message }
  const v = parsed.values
  const dashed = flagAsValue(v, ['base', 'model', 'concurrency', 'maxFiles', 'exclude', 'dir'])
  if (dashed !== undefined) return { error: dashed }
  const config: ReviewConfig = {
    ...DEFAULT_CONFIG,
    blocking: v.blocking,
    severityFloor: v.severity,
    engine: v.engine,
    exclude: v.exclude,
    ...(v.model !== undefined ? { model: v.model } : {}),
  }
  if (v.concurrency !== undefined) {
    const n = wholeNumber(v.concurrency)
    if (!(n >= 1)) return { error: '--concurrency expects a positive integer' }
    config.concurrency = n
  }
  if (v.maxFiles !== undefined) {
    const n = wholeNumber(v.maxFiles)
    if (!(n >= 0)) return { error: '--max-files expects a non-negative integer' }
    config.maxFilesPerJob = n
  }
  return {
    ...(v.base !== undefined ? { base: v.base } : {}),
    dryRun: v.dryRun,
    json: v.json,
    strict: v.strict,
    cwd: v.dir ?? process.cwd(),
    config,
  }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/**
 * Run `rule-review` with `argv` (the arguments after the binary name) and
 * return the exit code. Output goes to the process streams.
 */
export async function main(argv: string[]): Promise<number> {
  if (argv[0] === 'checks') return checksMain(argv.slice(1))
  const json = argv.includes('--json')
  const opts = parse(argv)
  if (opts === 'help') return EXIT_CODE.ok
  if ('error' in opts) return usage(opts.error, json, 'rule-review --help')

  let result
  try {
    result = await withInterrupt((signal) =>
      // With no --base, reviewChanges compares against HEAD: uncommitted work.
      reviewChanges({
        cwd: opts.cwd,
        ...(opts.base !== undefined ? { base: opts.base } : {}),
        config: opts.config,
        dryRun: opts.dryRun,
        signal,
      }),
    )
  } catch (err) {
    return fail(err, opts.json)
  }
  if (result.interrupted) return interrupted(opts.json, 'the running agents were')
  const run = result.value
  const files = run.changedFiles
  const baseLabel =
    run.resolvedBase === run.base ? run.base : `${run.base} (resolved to ${run.resolvedBase})`
  const incomplete = opts.strict && run.degraded
  // A dry run judges nothing, so it exits 0 whatever it would find.
  const exit = opts.dryRun
    ? EXIT_CODE.ok
    : incomplete
      ? EXIT_CODE.incomplete
      : exitCodeFor(run.findings, opts.config)

  if (opts.json) {
    const doc = { schemaVersion: SCHEMA_VERSION, kind: REVIEW_KIND, ...run }
    print(JSON.stringify(doc, null, 2) + '\n')
    return exit
  }

  if (files.length === 0) {
    say(`rule-review: no changes against ${baseLabel}.\n`)
    return EXIT_CODE.ok
  }

  if (run.jobs.length === 0) {
    say(
      `rule-review: ${plural(files.length, 'changed file')}, but no CLAUDE.md or AGENTS.md governs any of them.\n`,
    )
    return EXIT_CODE.ok
  }

  if (opts.dryRun) {
    const bytes = run.outcomes.reduce((n, o) => n + o.promptBytes, 0)
    const shards = run.jobs.filter((j) => j.shard !== undefined).length
    say(
      `rule-review --dry-run: would judge ${plural(files.length, 'changed file')} against ${baseLabel} ` +
        `in ${plural(run.jobs.length, 'job')}` +
        (shards > 0 ? ` (${shards} of them shards)` : '') +
        `, ~${formatTokens(estimateTokens(bytes))} tokens of prompt total.\n\n`,
    )
    for (const o of run.outcomes) {
      say(
        `  ${String(o.job.files.length).padStart(3)} ${o.job.files.length === 1 ? 'file ' : 'files'}  ` +
          `${formatTokens(estimateTokens(o.promptBytes)).padStart(6)} tok  ${jobLabel(o.job)}` +
          // A job the real run will not dispatch, which --strict fails on.
          (o.error === undefined ? '\n' : `  (${o.error})\n`),
      )
    }
    // Only a source a provider returned shows here: the built-in provider
    // does not return instruction files outside the change.
    if (run.skipped.length > 0) {
      say(`\n${plural(run.skipped.length, 'rule source')} matched no changed file.\n`)
    }
    say('\nNothing was dispatched. Drop --dry-run to run it.\n')
    return EXIT_CODE.ok
  }

  // Judgements, not rule sources: a sharded source contributes several, and
  // reporting "13/17 rule sources" when there are 17 jobs over 12 sources
  // would be counting two different things in one fraction.
  const judged = run.outcomes.filter((o) => o.error === undefined).length
  const sourceCount = new Set(run.jobs.map((j) => j.source.id)).size
  say(
    `rule-review: ${judged}/${run.jobs.length} judgements over ${plural(sourceCount, 'rule source')} ` +
      `covered ${plural(files.length, 'changed file')} against ${baseLabel}.\n`,
  )
  for (const o of run.outcomes) {
    if (o.error !== undefined) say(`  ! ${jobLabel(o.job)}: ${o.error}\n`)
    if (o.oversize !== undefined) {
      say(
        `  ~ ${jobLabel(o.job)}: ~${formatTokens(estimateTokens(o.oversize.bytes))} tokens of prompt — ` +
          'judgements at this scope are less reliable\n',
      )
    }
  }

  if (run.findings.length === 0) {
    say(run.degraded ? '\nNo findings, but the run was incomplete.\n' : '\nNo findings.\n')
    return exit
  }

  let current = ''
  for (const f of run.findings) {
    if (f.sourceId !== current) {
      current = f.sourceId
      say(`\n${f.sourcePath}\n`)
    }
    const where = f.line === undefined ? f.file : `${f.file}:${f.line}`
    say(`  ${f.severity.padEnd(9)}  ${where}\n      ${f.why}\n`)
    say(`      > ${(f.evidence.split('\n')[0] ?? '').slice(0, 120)}\n`)
  }
  say(
    `\n${plural(run.findings.length, 'finding')}` +
      (opts.config.blocking ? '.\n' : ' (advisory — pass --blocking to gate on these).\n'),
  )

  if (incomplete) say('The run was incomplete (--strict).\n')
  return exit
}
