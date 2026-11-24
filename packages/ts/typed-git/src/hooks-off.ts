/**
 * Running git with its hooks off, whatever config the environment brings.
 *
 * `core.hooksPath=/dev/null` turns every hook off. Set through
 * `GIT_CONFIG_COUNT` alone it loses to an inherited `GIT_CONFIG_PARAMETERS`,
 * which git reads after it: a program started from a git alias or hook run as
 * `git -c core.hooksPath=.husky ...` inherits that setting there, and a
 * relative `.husky` runs the hooks the checked-out commit holds.
 */

/** The entry, as git itself writes one for `-c core.hooksPath=/dev/null`: each part in single quotes. */
const HOOKS_OFF_PARAMETER = "'core.hookspath'='/dev/null'"

/**
 * The variables that turn git's hooks off in each git they reach, to merge
 * over `parent`, the environment the child inherits. `core.hooksPath` is set
 * to `/dev/null` twice, each time after what `parent` already holds:
 * - as the next `GIT_CONFIG_KEY_<n>`/`GIT_CONFIG_VALUE_<n>` pair, with
 *   `GIT_CONFIG_COUNT` one higher, keeping the inherited pairs;
 * - as `'core.hookspath'='/dev/null'` at the end of `GIT_CONFIG_PARAMETERS`,
 *   keeping the inherited entries, quoted as git quotes them.
 *
 * The last value git reads for a key wins. It reads config files, then the
 * `GIT_CONFIG_COUNT` pairs, then `GIT_CONFIG_PARAMETERS`, so the two entries
 * beat a repository's `core.hooksPath` and one a parent git's `-c` passed on.
 * Only a `-c` on the git command itself comes later. A git started by a git so
 * run inherits both variables, so its hooks are off too.
 * Both forms need git 2.31 or later, which typed-git's floor, 2.34, meets.
 *
 * @param parent - The environment the child inherits. Default `process.env`.
 *
 * @example
 * ```ts
 * new Git(checkout).checkout(sha, { env: hooksOffEnv() })
 * ```
 */
export function hooksOffEnv(
  parent: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const parsed = Number.parseInt(parent.GIT_CONFIG_COUNT ?? '', 10)
  const i = Number.isInteger(parsed) && parsed > 0 ? parsed : 0
  const inherited = (parent.GIT_CONFIG_PARAMETERS ?? '').trim()
  return {
    GIT_CONFIG_COUNT: String(i + 1),
    [`GIT_CONFIG_KEY_${i}`]: 'core.hooksPath',
    [`GIT_CONFIG_VALUE_${i}`]: '/dev/null',
    GIT_CONFIG_PARAMETERS:
      inherited === '' ? HOOKS_OFF_PARAMETER : `${inherited} ${HOOKS_OFF_PARAMETER}`,
  }
}
