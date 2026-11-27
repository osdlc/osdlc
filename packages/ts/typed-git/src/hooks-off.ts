/**
 * Setting git config for every git a call reaches, whatever config the environment brings.
 *
 * A setting passed through `GIT_CONFIG_COUNT` alone loses to an inherited
 * `GIT_CONFIG_PARAMETERS`, which git reads after it: a program started from a git alias or hook
 * run as `git -c core.hooksPath=.husky ...` inherits that setting there, and a relative `.husky`
 * runs the hooks the checked-out commit holds.
 */

/** `text` in single quotes, as git quotes each part of a `GIT_CONFIG_PARAMETERS` entry. */
function sqQuote(text: string): string {
  return `'${text.replaceAll("'", "'\\''").replaceAll('!', "'\\!'")}'`
}

/**
 * The variables that set each `[key, value]` of `entries` in each git they reach, to merge over
 * `parent`, the environment the child inherits. Each entry is set twice, after what `parent`
 * already holds:
 * - as the next `GIT_CONFIG_KEY_<n>`/`GIT_CONFIG_VALUE_<n>` pair, with `GIT_CONFIG_COUNT` raised
 *   to match, keeping the inherited pairs;
 * - as `'<key>'='<value>'` at the end of `GIT_CONFIG_PARAMETERS`, keeping the inherited entries,
 *   quoted as git quotes them.
 *
 * The last value git reads for a key wins. It reads config files, then the `GIT_CONFIG_COUNT`
 * pairs, then `GIT_CONFIG_PARAMETERS`, so these beat the repository's config and a `-c` a parent
 * git passed on. Only a `-c` on the git command itself comes later. A git started by a git so run
 * inherits both variables, so the settings reach it too. Both forms need git 2.31 or later, which
 * typed-git's floor, 2.34, meets.
 *
 * @param entries - The settings, each a config key and its value.
 * @param parent - The environment the child inherits. Default `process.env`.
 *
 * @example
 * ```ts
 * new Git(clone).fetch('origin', undefined, { env: gitConfigEnv([['gc.auto', '0']]) })
 * ```
 */
export function gitConfigEnv(
  entries: readonly (readonly [key: string, value: string])[],
  parent: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const parsed = Number.parseInt(parent.GIT_CONFIG_COUNT ?? '', 10)
  const first = Number.isInteger(parsed) && parsed > 0 ? parsed : 0
  const inherited = (parent.GIT_CONFIG_PARAMETERS ?? '').trim()
  const out: Record<string, string> = { GIT_CONFIG_COUNT: String(first + entries.length) }
  const params = inherited === '' ? [] : [inherited]
  entries.forEach(([key, value], at) => {
    out[`GIT_CONFIG_KEY_${first + at}`] = key
    out[`GIT_CONFIG_VALUE_${first + at}`] = value
    params.push(`${sqQuote(key)}=${sqQuote(value)}`)
  })
  out.GIT_CONFIG_PARAMETERS = params.join(' ')
  return out
}

/**
 * The variables that turn git's hooks off in each git they reach, to merge over `parent`:
 * {@link gitConfigEnv} with `core.hooksPath=/dev/null`, so they beat a repository's
 * `core.hooksPath` and one a parent git's `-c` passed on.
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
  return gitConfigEnv([['core.hooksPath', '/dev/null']], parent)
}
