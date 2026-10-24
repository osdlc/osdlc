/**
 * The git-backed `ownerOf` handed to `@osdlc/trust-repo`, which knows no git.
 * Without it `trust.owners` never matches.
 */

import { Git, parseGitUrl } from '@osdlc/typed-git'

/**
 * Git variables the caller's environment must not apply to the owner lookup:
 * they point git at another repository or add config that rewrites the
 * remote. Git itself exports `GIT_DIR`, `GIT_INDEX_FILE`, `GIT_COMMON_DIR`
 * and `GIT_CONFIG_PARAMETERS` (from `-c`) to hooks and aliases, so they leak
 * into a tool by accident. `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM` and
 * `GIT_CONFIG_NOSYSTEM` are kept on purpose: they are deliberate user setup,
 * like `~/.gitconfig`, whose `insteadOf` rules still apply.
 */
const GIT_LOCATION_VARS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR']
const GIT_CONFIG_VAR = /^GIT_CONFIG(?:$|_COUNT$|_PARAMETERS$|_KEY_\d+$|_VALUE_\d+$)/

/**
 * Run `fn` with the git variables listed above removed from `process.env`,
 * then put them back. The typed git client's `env` option is add-only, and an
 * empty `GIT_DIR` is an error, so the variables are removed around one call.
 * `fn` must be synchronous: the process environment is shared, so an await
 * inside would let other code see the change.
 */
function withoutGitOverrides<T>(fn: () => T): T {
  const saved = new Map<string, string>()
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined) continue
    if (GIT_LOCATION_VARS.includes(name) || GIT_CONFIG_VAR.test(name)) saved.set(name, value)
  }
  for (const name of saved.keys()) delete process.env[name]
  try {
    return fn()
  } finally {
    for (const [name, value] of saved) process.env[name] = value
  }
}

/** A remote git reads as a URL (`scheme://...`) or as scp-style (`[user@]host:path`). */
const URL_REMOTE = /^[a-z][a-z0-9+.-]*:\/\//i
const SCP_REMOTE = /^(?:[^@/:\s]+@)?[^@/:\s]+:(?!\/\/)/
/**
 * hosted-git-info shortcuts (`github:owner/repo`). Git reads these as scp-style
 * ssh to a host called `github`, so they have no owner here.
 */
const SHORTCUT_REMOTE = /^(?:github|gitlab|bitbucket|gist|sourcehut):/

/**
 * `root`'s `origin` remote owner, or null when there is none we can read.
 * Git runs in `root` with the caller's git location and config variables
 * removed, so they cannot point it at another repository. Git still searches
 * upward from `root`, so a directory without its own `.git` inside a
 * repository gets that repository's owner. A remote that is neither a URL nor
 * scp-style is a local path (`owner/repo` is one) and has no owner. A host
 * hosted-git-info does not know (a self-hosted server) has no owner either.
 */
export function originOwner(root: string): string | null {
  const res = withoutGitOverrides(() => new Git(root).try.remoteGetUrl('origin'))
  if (!res.ok || res.value === null) return null
  if (SHORTCUT_REMOTE.test(res.value)) return null
  if (!URL_REMOTE.test(res.value) && !SCP_REMOTE.test(res.value)) return null
  const info = parseGitUrl(res.value)
  return info?.user && info.project ? info.user : null
}
