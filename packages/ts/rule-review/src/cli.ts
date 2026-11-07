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

import { checksMain } from './checks-command.ts'
import { exitCodeFor } from './findings.ts'
import { ChangesetError, reviewChanges, type ChangesReview } from './review-changes.ts'
import { ScopeError } from './select.ts'
import { estimateTokens, formatTokens, jobLabel } from './tokens.ts'
import { DEFAULT_CONFIG, type ReviewConfig, type Severity } from './types.ts'

const USAGE = `rule-review — review a changeset against the rule files that govern it

Every CLAUDE.md / AGENTS.md governs its own directory. rule-review finds the
ones whose scope encloses a changed file and asks an agent about each one,
separately, over only the files it governs.

Usage
  rule-review [options]
  rule-review <command> [args]

Commands
  checks <dir>        Run a folder of numbered check scripts.
                      See 'rule-review checks --help'.

Options
  --base <ref>        Compare against <ref>. Default: uncommitted work only.
                      Use a branch name for the whole branch, @{u} to include
                      unpushed commits.
  --dry-run           Show what would be judged, and what it would cost, without
                      starting an agent. Free and fast.
  --blocking          Exit 1 on findings at or above the severity floor.
  --severity <level>  violation (default), tension, or drift.
  --strict            Exit 2 when a judgement could not complete (the agent
                      failed, timed out, or gave no findings object). Without
                      it, an incomplete run is reported and exits as usual.
  --engine <name>     ${BUILTIN_AGENTS.join(', ')}. Default: ${DEFAULT_CONFIG.engine}.
  --model <id>        Model to judge with. Default: the engine's own.
  --concurrency <n>   Judgements in flight at once. Default: ${DEFAULT_CONFIG.concurrency}.
  --max-files <n>     Files per judgement; a broader source is split into that
                      many-file shards, judged concurrently against the same
                      rules. 0 disables. Default: ${DEFAULT_CONFIG.maxFilesPerJob}.
  --exclude <glob>    Drop matching paths. Repeatable.
  --json              Print the run as JSON on stdout instead of the report.
  -C <dir>            Run against <dir> instead of the current directory.
  -h, --help          This text.
  --version           Print the version.

Exit codes
  0    clean, or advisory (the default: findings are reported, not enforced)
  1    findings at or above the floor, with --blocking
  2    usage error, the run could not start, or (with --strict) it was incomplete
  130  interrupted by SIGINT or SIGTERM; running agents are killed
`

interface Options {
  base?: string
  dryRun: boolean
  json: boolean
  strict: boolean
  cwd: string
  config: ReviewConfig
}

/**
 * A whole decimal integer, or NaN. `parseInt` would read `1.5`, `1e2`,
 * `12abc` and `0x10` as their leading digits instead of rejecting them.
 */
function wholeNumber(v: string): number {
  return /^\d+$/.test(v) ? Number(v) : Number.NaN
}

/** Read one value that must follow its flag. */
function value(argv: string[], i: number, flag: string): string {
  const v = argv[i + 1]
  if (v === undefined || v.startsWith('-')) {
    throw new Error(`${flag} needs a value`)
  }
  return v
}

function parse(argv: string[]): Options | 'help' {
  const opts: Options = {
    dryRun: false,
    json: false,
    strict: false,
    cwd: process.cwd(),
    config: { ...DEFAULT_CONFIG, exclude: [] },
  }
  const exclude: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    switch (arg) {
      case '-h':
      case '--help':
        return 'help'
      case '--dry-run':
        opts.dryRun = true
        break
      case '--json':
        opts.json = true
        break
      case '--blocking':
        opts.config.blocking = true
        break
      case '--strict':
        opts.strict = true
        break
      case '--base':
        opts.base = value(argv, i++, arg)
        break
      case '-C':
        opts.cwd = value(argv, i++, arg)
        break
      case '--engine': {
        const v = value(argv, i++, arg)
        if (!(BUILTIN_AGENTS as readonly string[]).includes(v)) {
          throw new Error(`--engine expects one of ${BUILTIN_AGENTS.join(', ')} (got '${v}')`)
        }
        opts.config.engine = v
        break
      }
      case '--model':
        opts.config.model = value(argv, i++, arg)
        break
      case '--exclude':
        exclude.push(value(argv, i++, arg))
        break
      case '--severity': {
        const v = value(argv, i++, arg)
        if (v !== 'violation' && v !== 'tension' && v !== 'drift') {
          throw new Error(`--severity expects violation, tension, or drift (got '${v}')`)
        }
        opts.config.severityFloor = v as Severity
        break
      }
      case '--concurrency': {
        const n = wholeNumber(value(argv, i++, arg))
        if (!Number.isInteger(n) || n < 1)
          throw new Error('--concurrency expects a positive integer')
        opts.config.concurrency = n
        break
      }
      case '--max-files': {
        const n = wholeNumber(value(argv, i++, arg))
        if (!Number.isInteger(n) || n < 0)
          throw new Error('--max-files expects a non-negative integer')
        opts.config.maxFilesPerJob = n
        break
      }
      default:
        throw new Error(`unknown option '${arg}' (try --help)`)
    }
  }
  opts.config.exclude = exclude
  return opts
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export async function main(argv: string[]): Promise<number> {
  if (argv[0] === 'checks') return checksMain(argv.slice(1))
  let opts: Options | 'help'
  try {
    opts = parse(argv)
  } catch (err) {
    process.stderr.write(`rule-review: ${err instanceof Error ? err.message : String(err)}\n`)
    return 2
  }
  if (opts === 'help') {
    process.stdout.write(USAGE)
    return 0
  }

  // Each agent leads its own process group, out of reach of the terminal's
  // Ctrl-C, so the signal is forwarded to the run.
  const interrupt = new AbortController()
  const onSignal = () => interrupt.abort()
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  let run: ChangesReview
  try {
    run = await reviewChanges({
      cwd: opts.cwd,
      // Default to uncommitted work: it is the faster run, and mid-change it is
      // what you are about to be judged on.
      base: opts.base ?? 'HEAD',
      config: opts.config,
      dryRun: opts.dryRun,
      signal: interrupt.signal,
    })
  } catch (err) {
    if (!(err instanceof ScopeError || err instanceof ChangesetError)) throw err
    process.stderr.write(`rule-review: ${err.message}\n`)
    return 2
  } finally {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
  }
  if (interrupt.signal.aborted) {
    process.stderr.write('rule-review: interrupted.\n')
    return 130
  }
  const files = run.changedFiles
  const baseLabel =
    run.resolvedBase === run.base ? run.base : `${run.base} (resolved to ${run.resolvedBase})`
  const exit = (): number =>
    opts.strict && run.degraded ? 2 : exitCodeFor(run.findings, opts.config)

  if (opts.json) {
    process.stdout.write(JSON.stringify(run, null, 2) + '\n')
    return exit()
  }

  if (files.length === 0) {
    process.stderr.write(`rule-review: no changes against ${baseLabel}.\n`)
    return 0
  }

  if (run.jobs.length === 0) {
    process.stderr.write(
      `rule-review: ${plural(files.length, 'changed file')}, but no CLAUDE.md or AGENTS.md governs any of them.\n`,
    )
    return 0
  }

  if (opts.dryRun) {
    const bytes = run.outcomes.reduce((n, o) => n + o.promptBytes, 0)
    const shards = run.jobs.filter((j) => j.shard !== undefined).length
    process.stderr.write(
      `rule-review --dry-run: would judge ${plural(files.length, 'changed file')} against ${baseLabel} ` +
        `in ${plural(run.jobs.length, 'job')}` +
        (shards > 0 ? ` (${shards} of them shards)` : '') +
        `, ~${formatTokens(estimateTokens(bytes))} tokens of prompt total.\n\n`,
    )
    for (const o of run.outcomes) {
      process.stderr.write(
        `  ${String(o.job.files.length).padStart(3)} ${o.job.files.length === 1 ? 'file ' : 'files'}  ` +
          `${formatTokens(estimateTokens(o.promptBytes)).padStart(6)} tok  ${jobLabel(o.job)}\n`,
      )
    }
    if (run.skipped.length > 0) {
      process.stderr.write(
        `\n${plural(run.skipped.length, 'rule source')} not in scope, costing nothing.\n`,
      )
    }
    process.stderr.write('\nNothing was dispatched. Drop --dry-run to run it.\n')
    return 0
  }

  // Judgements, not rule sources: a sharded source contributes several, and
  // reporting "13/17 rule sources" when there are 17 jobs over 12 sources
  // would be counting two different things in one fraction.
  const judged = run.outcomes.filter((o) => o.error === undefined).length
  const sourceCount = new Set(run.jobs.map((j) => j.source.id)).size
  process.stderr.write(
    `rule-review: ${judged}/${run.jobs.length} judgements over ${plural(sourceCount, 'rule source')} ` +
      `covered ${plural(files.length, 'changed file')} against ${baseLabel}.\n`,
  )
  for (const o of run.outcomes) {
    if (o.error !== undefined) process.stderr.write(`  ! ${jobLabel(o.job)}: ${o.error}\n`)
    if (o.oversize !== undefined) {
      process.stderr.write(
        `  ~ ${jobLabel(o.job)}: ~${formatTokens(estimateTokens(o.oversize.bytes))} tokens of prompt — ` +
          'judgements at this scope are less reliable\n',
      )
    }
  }

  if (run.findings.length === 0) {
    process.stderr.write(
      run.degraded ? '\nNo findings, but the run was incomplete.\n' : '\nNo findings.\n',
    )
    return exit()
  }

  let current = ''
  for (const f of run.findings) {
    if (f.sourceId !== current) {
      current = f.sourceId
      process.stderr.write(`\n${f.sourcePath}\n`)
    }
    const where = f.line === undefined ? f.file : `${f.file}:${f.line}`
    process.stderr.write(`  ${f.severity.padEnd(9)}  ${where}\n      ${f.why}\n`)
    process.stderr.write(`      > ${(f.evidence.split('\n')[0] ?? '').slice(0, 120)}\n`)
  }
  process.stderr.write(
    `\n${plural(run.findings.length, 'finding')}` +
      (opts.config.blocking ? '.\n' : ' (advisory — pass --blocking to gate on these).\n'),
  )

  if (opts.strict && run.degraded) {
    process.stderr.write('The run was incomplete (--strict).\n')
  }
  return exit()
}
