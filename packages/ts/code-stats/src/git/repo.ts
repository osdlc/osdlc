import {
  spawnRunner,
  spawnRunnerBytes,
  type BytesCommandRunner,
  type CommandRunner,
} from '@osdlc/command-seam'
import { Gh } from '@osdlc/typed-gh'
import { Git } from '@osdlc/typed-git'

import { CodeStatsError, guardCommand } from '../error.ts'

/** The commands code-stats runs; each defaults to the binary on PATH. */
export interface Runners {
  git?: CommandRunner
  /**
   * `git` with byte output, for reading blobs exactly. A separate seam from
   * `git`: when it is left out, blobs are read by a real `git` process even
   * if `git` is a fake or a recorder.
   */
  gitBytes?: BytesCommandRunner
  gh?: CommandRunner
}

/** A repository to read, rooted at its top level, so paths match the ones git prints. */
export interface Repo {
  root: string
  git: Git
  gitBytes: BytesCommandRunner
  gh: Gh
}

/**
 * `gh` colours its output into a pipe when `CLICOLOR_FORCE` or `GH_FORCE_TTY`
 * is set, which would hide every diff header and break JSON. Both are removed
 * and `NO_COLOR` set, over any `env` a call passes too: no call here wants
 * colour, so the override is deliberate. typed-gh's parsed verbs set the same
 * variables; this covers the raw `gh` calls made here too.
 */
function withoutColor(runner: CommandRunner): CommandRunner {
  const env = { NO_COLOR: '1', CLICOLOR_FORCE: undefined, GH_FORCE_TTY: undefined }
  return {
    binary: runner.binary,
    run: (argv, opts) => runner.run(argv, { ...opts, env: { ...opts.env, ...env } }),
  }
}

/** The repository's top level, or a `needs-git` error when git is not installed or `cwd` is in no repository. */
function topLevel(cwd: string, runner: CommandRunner): string {
  const root = guardCommand('could not find the git repository', () =>
    new Git(cwd, { runner }).topLevel(),
  )
  if (root === null) {
    const message = `not a git repository: ${cwd}`
    throw new CodeStatsError(message, {
      kind: 'needs-git',
      failure: { kind: 'not-a-repo', message },
    })
  }
  return root
}

/** Opens the repository holding `cwd`; a {@link CodeStatsError} of kind `needs-git` when there is none, or no git. */
export function openRepo(cwd: string, runners: Runners = {}): Repo {
  const gitRunner = runners.git ?? spawnRunner('git')
  const root = topLevel(cwd, gitRunner)
  return {
    root,
    git: new Git(root, { runner: gitRunner }),
    gitBytes: runners.gitBytes ?? spawnRunnerBytes('git'),
    gh: new Gh(root, { runner: withoutColor(runners.gh ?? spawnRunner('gh')) }),
  }
}
