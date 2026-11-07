/**
 * `rule-review checks <dir>`: run a folder of numbered check scripts.
 */
import { resolve } from 'node:path'

import { Git } from '@osdlc/typed-git'

import {
  errorText,
  filesSince,
  forkPointOf,
  resolveBase,
  stagedFiles,
  trackedFiles,
  type Changeset,
} from './changeset.ts'
import {
  checksExitCode,
  formatPlan,
  formatReport,
  planChecks,
  runChecks,
  runToJson,
} from './checks.ts'
import { print, say, sayError } from './output.ts'
import { readCheckFolder } from './providers/check-folder.ts'

const CHECKS_USAGE = `rule-review checks — run a folder of check scripts

Usage
  rule-review checks <dir> [options]

Each executable file named <number>-<name> in <dir> is a check. Checks run one
at a time in number order, with the project root as cwd. A .md file is a prompt
check and is reported as skipped. Anything else is skipped with its reason.

Options
  --base <rev>  Select by the files changed against <rev> and the working tree.
  --staged      Select by the files staged in the index.
  --all         Select by every tracked file, so each check sees its whole scope.
                --base, --staged and --all are mutually exclusive. With none,
                the changeset is uncommitted work, as in bare rule-review. Outside git
                there is no changeset: every script runs, with empty stdin and
                no CHECK_BASE.
  --dry-run   List what would run and what is skipped, without running anything.
  --json      Emit the results as JSON instead of text.
  -C <dir>    Run from <dir>. The project root is its git top-level, or <dir>
              itself outside git.
  -h, --help  This text.

Environment of each script
  CHECK_ROOT   absolute project root
  CHECK_NAME   the name after the number prefix, extension kept
  CHECK_ORDER  the number prefix
  CHECK_DIR    absolute path of <dir>
  CHECK_BASE   the commit the changeset was measured from: HEAD with no flag
               or --staged, the fork point of <rev> and HEAD with --base (so
               'git diff "$CHECK_BASE"' shows the same change), empty with --all

A script reads its in-scope changed files on stdin, one repo-relative path per
line. A script declares scope with '# applies_to: <glob>' lines in its leading
comments; several lines add up, and none means every file. A script whose scope
matches no changed file is skipped with 'no changed files in scope'.

A script may declare '# timeout: <seconds>' in its leading comments.
Default: 600.

Exit codes
  0  every check passed or was skipped
  1  a check failed or errored (non-zero exit, timeout, or signal)
  2  the run could not be started (usage error, folder not found)
  130  interrupted by SIGINT or SIGTERM
`

interface ChecksOptions {
  dir: string
  base: string | undefined
  staged: boolean
  all: boolean
  dryRun: boolean
  json: boolean
  cwd: string
}

function parseChecks(argv: string[]): ChecksOptions | 'help' {
  let dir: string | undefined
  let dryRun = false
  let json = false
  let base: string | undefined
  let staged = false
  let all = false
  let cwd = process.cwd()

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    switch (arg) {
      case '-h':
      case '--help':
        return 'help'
      case '--dry-run':
        dryRun = true
        break
      case '--json':
        json = true
        break
      case '--base': {
        const v = argv[++i]
        if (v === undefined || v.startsWith('-')) throw new Error('--base needs a value')
        base = v
        break
      }
      case '--staged':
        staged = true
        break
      case '--all':
        all = true
        break
      case '-C': {
        const v = argv[++i]
        if (v === undefined || v.startsWith('-')) throw new Error('-C needs a value')
        cwd = v
        break
      }
      default:
        if (arg.startsWith('-')) throw new Error(`unknown option '${arg}' (try --help)`)
        if (dir !== undefined) throw new Error(`unexpected argument '${arg}' (try --help)`)
        dir = arg
    }
  }
  if (dir === undefined) throw new Error('checks needs a folder: rule-review checks <dir>')
  const modes = [base !== undefined, staged, all].filter(Boolean).length
  if (modes > 1) throw new Error('--base, --staged and --all are mutually exclusive')
  return { dir, base, staged, all, dryRun, json, cwd }
}

/** The changed files and `CHECK_BASE` label for the chosen mode. */
function changesetFor(git: Git, opts: ChecksOptions): Changeset {
  if (opts.staged) return { files: stagedFiles(git), base: 'HEAD' }
  if (opts.all) return { files: trackedFiles(git), base: '' }
  // CHECK_BASE is the fork point the files were measured from, so a script
  // that diffs against it sees the same change its stdin lists.
  const ref = forkPointOf(git, resolveBase(git, opts.base ?? 'HEAD'))
  // Deleted paths are left out, as `--staged` leaves them out: a script cannot run on them.
  return { files: filesSince(git, ref, { existingOnly: true }), base: ref }
}

/**
 * Print why the run could not complete and return 2. Exit 1 means a check
 * failed, so an error must never surface as 1: a bad scope pattern, and any
 * other fault, is "could not run".
 */
function reportRunError(err: unknown): number {
  sayError(err)
  return 2
}

export async function checksMain(argv: string[]): Promise<number> {
  let opts: ChecksOptions | 'help'
  try {
    opts = parseChecks(argv)
  } catch (err) {
    say(`rule-review: ${errorText(err)}\n`)
    return 2
  }
  if (opts === 'help') {
    print(CHECKS_USAGE)
    return 0
  }

  const cwd = resolve(opts.cwd)
  let topLevel: string | null
  try {
    topLevel = new Git(cwd).topLevel()
  } catch (err) {
    // A missing -C directory fails the spawn itself, which typed-git throws
    // rather than reading as "not a repo". It is still a usage error.
    say(`rule-review: ${cwd}: ${errorText(err)}\n`)
    return 2
  }
  const root = topLevel ?? cwd
  const dir = resolve(cwd, opts.dir)

  let folder
  try {
    folder = await readCheckFolder(dir)
  } catch (err) {
    say(`rule-review: cannot read check folder ${dir}: ${errorText(err)}\n`)
    return 2
  }

  const explicit = opts.base !== undefined || opts.staged || opts.all
  if (topLevel === null && explicit) {
    say(`rule-review: ${cwd} is not inside a git repository\n`)
    return 2
  }
  let changeset: Changeset | undefined
  try {
    changeset = topLevel === null ? undefined : changesetFor(new Git(root), opts)
  } catch (err) {
    say(`rule-review: could not list changed files: ${errorText(err)}\n`)
    return 2
  }

  if (opts.dryRun) {
    let plan
    try {
      plan = planChecks(folder, changeset)
    } catch (err) {
      return reportRunError(err)
    }
    print(opts.json ? JSON.stringify({ dryRun: true, ...plan }, null, 2) + '\n' : formatPlan(plan))
    return 0
  }

  // Each check leads its own process group, out of reach of the terminal's
  // Ctrl-C, so the signal is forwarded to the run.
  const interrupt = new AbortController()
  const onSignal = () => interrupt.abort()
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  let run
  try {
    run = await runChecks(folder, { projectRoot: root, changeset, signal: interrupt.signal })
  } catch (err) {
    return reportRunError(err)
  } finally {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
  }
  print(opts.json ? JSON.stringify(runToJson(run), null, 2) + '\n' : formatReport(run))
  return interrupt.signal.aborted ? 130 : checksExitCode(run.results)
}
