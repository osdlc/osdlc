/**
 * Running git without the variables that pick a repository for it.
 *
 * A git hook exports `GIT_DIR`, and a receive hook also sets
 * `GIT_OBJECT_DIRECTORY` and `GIT_ALTERNATE_OBJECT_DIRECTORIES`. A program the
 * hook starts inherits them, and then every git it runs acts on the hook's
 * repository, whatever directory it runs in. In a linked worktree that moves
 * the main checkout's branch.
 */

import { spawnRunner, type CommandRunner } from '@osdlc/command-seam'

/**
 * The variables that tell git which repository, work tree, index and object
 * store to use, whatever the directory, and `GIT_CEILING_DIRECTORIES`, which
 * limits where git looks for one. Unset them to make git find the repository
 * from the directory it runs in.
 */
export const REPOSITORY_VARS: readonly string[] = Object.freeze([
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CEILING_DIRECTORIES',
])

/**
 * `runner`, with every one of {@link REPOSITORY_VARS} unset in each child it
 * starts. command-seam drops a variable whose value is `undefined`, so the
 * child does not inherit it. A value the call sets itself, such as its own
 * `GIT_CEILING_DIRECTORIES`, still wins. Works for any runner, so a program
 * that runs git for you, such as `gh repo clone`, can be wrapped too.
 *
 * @param runner - Defaults to the client's own default: `git` found on an
 * absolute `PATH` entry.
 *
 * @example
 * ```ts
 * const git = new Git(checkout, { runner: withoutRepositoryVars() })
 * ```
 */
export function withoutRepositoryVars(
  runner: CommandRunner = spawnRunner('git', { absolutePathOnly: true }),
): CommandRunner {
  const unset = Object.fromEntries(REPOSITORY_VARS.map((name) => [name, undefined]))
  return {
    ...(runner.binary === undefined ? {} : { binary: runner.binary }),
    run: (argv, opts) => runner.run(argv, { ...opts, env: { ...unset, ...opts.env } }),
  }
}
