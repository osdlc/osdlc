/**
 * `rule-review checks <dir>`: run a folder of numbered check scripts.
 */
import { resolve } from 'node:path'

import { defineCli, processIo } from '@osdlc/cli-tool'
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
import { EXIT_CODE, fail, flagAsValue, interrupted, usage, withInterrupt } from './exit.ts'
import { print } from './output.ts'
import { readCheckFolder } from './providers/check-folder.ts'

const CLI = defineCli({
  name: 'rule-review checks',
  summary: `Run a folder of check scripts.

Each executable file named <number>-<name> in <dir> is a check. Checks run one
at a time in number order, with the project root as cwd. A .md file is a prompt
check and is reported as skipped. Anything else is skipped with its reason.`,
  positionals: [{ name: 'dir', required: true, help: 'the folder of check scripts' }],
  flags: {
    base: {
      kind: 'string',
      valueName: 'rev',
      help: 'select by the files changed against <rev> and the working tree',
    },
    staged: { kind: 'boolean', help: 'select by the files staged in the index' },
    all: {
      kind: 'boolean',
      help: 'select by every tracked file, so each check sees its whole scope',
    },
    dryRun: {
      kind: 'boolean',
      help: 'list what would run and what is skipped, without running anything',
    },
    json: { kind: 'boolean', help: 'print the results as one JSON document on stdout' },
    dir: {
      kind: 'string',
      short: 'C',
      valueName: 'dir',
      help: 'run from <dir>. The project root is its git top level, or <dir> itself outside git',
    },
  },
  epilogue: `--base, --staged and --all are mutually exclusive. With none, the changeset
is uncommitted work, as in bare rule-review. Outside git there is no changeset:
every script runs, with empty stdin and no CHECK_BASE.

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
  0    every check passed or was skipped
  1    a check failed or errored (non-zero exit, timeout, or signal)
  2    the command line cannot run as typed
  10   the run could not complete: the folder cannot be read, the changed
       files cannot be listed, a scope pattern cannot be read
  24   the directory does not exist, or a changeset flag was given outside git
  130  interrupted by SIGINT or SIGTERM; the running check is killed

Under --json a failure prints {"schemaVersion":1,"kind":"error",...} on stdout.`,
})

/** The `kind` of each `--json` document. */
const KIND = { run: 'checks', plan: 'checks-plan' } as const

interface ChecksOptions {
  dir: string
  base: string | undefined
  staged: boolean
  all: boolean
  dryRun: boolean
  json: boolean
  cwd: string
}

function parseChecks(argv: string[]): ChecksOptions | 'help' | { error: string } {
  const parsed = CLI.parse(argv, processIo)
  if (parsed.status === 'help') return 'help'
  if (parsed.status === 'error') return { error: parsed.message }
  const v = parsed.values
  const dashed = flagAsValue(v, ['base', 'dir'])
  if (dashed !== undefined) return { error: dashed }
  const modes = [v.base !== undefined, v.staged, v.all].filter(Boolean).length
  if (modes > 1) return { error: '--base, --staged and --all are mutually exclusive' }
  return {
    dir: parsed.positionals[0]!,
    base: v.base,
    staged: v.staged,
    all: v.all,
    dryRun: v.dryRun,
    json: v.json,
    cwd: v.dir ?? process.cwd(),
  }
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

/** Print `body` as the command's one JSON document, of kind `kind`. */
function printDoc(kind: string, body: object): void {
  print(JSON.stringify({ schemaVersion: 1, kind, ...body }, null, 2) + '\n')
}

/**
 * Run `rule-review checks` with `argv` (the arguments after `checks`) and
 * return the exit code.
 */
export async function checksMain(argv: string[]): Promise<number> {
  const json = argv.includes('--json')
  const opts = parseChecks(argv)
  if (opts === 'help') return EXIT_CODE.ok
  if ('error' in opts) return usage(opts.error, json, 'rule-review checks --help')

  const cwd = resolve(opts.cwd)
  const noRepository = { code: 'not-a-repository', exit: EXIT_CODE.noRepository }
  let topLevel: string | null
  try {
    topLevel = new Git(cwd).topLevel()
  } catch (err) {
    // A missing -C directory fails the spawn itself rather than reading as "not a repo".
    return fail(`${cwd}: ${errorText(err)}`, opts.json, noRepository)
  }
  const root = topLevel ?? cwd
  const dir = resolve(cwd, opts.dir)

  let folder
  try {
    folder = await readCheckFolder(dir)
  } catch (err) {
    return fail(`cannot read check folder ${dir}: ${errorText(err)}`, opts.json)
  }

  const explicit = opts.base !== undefined || opts.staged || opts.all
  if (topLevel === null && explicit) {
    return fail(`${cwd} is not inside a git repository`, opts.json, noRepository)
  }
  let changeset: Changeset | undefined
  try {
    changeset = topLevel === null ? undefined : changesetFor(new Git(root), opts)
  } catch (err) {
    return fail(`could not list changed files: ${errorText(err)}`, opts.json)
  }

  if (opts.dryRun) {
    let plan
    try {
      plan = planChecks(folder, changeset)
    } catch (err) {
      return fail(err, opts.json)
    }
    if (opts.json) printDoc(KIND.plan, plan)
    else print(formatPlan(plan))
    return EXIT_CODE.ok
  }

  let result
  try {
    result = await withInterrupt((signal) =>
      runChecks(folder, { projectRoot: root, changeset, signal }),
    )
  } catch (err) {
    return fail(err, opts.json)
  }
  const run = result.value
  if (opts.json) printDoc(KIND.run, runToJson(run))
  else print(formatReport(run))
  // Under --json the results are already printed; the interruption goes to stderr only.
  if (result.interrupted) return interrupted(false, 'the running check was')
  return checksExitCode(run.results)
}
