/**
 * `@osdlc/trust-repo/git`: the git-backed `ownerOf` that the `owners` rule
 * needs. The main entry point runs no program. This entry point runs `git`
 * through `@osdlc/command-seam`, so only a tool that imports it runs git.
 */

import { spawnRunner, type CommandRunner } from '@osdlc/command-seam'
import { Git, hooksOffEnv, parseGitUrl, withoutRepositoryVars } from '@osdlc/typed-git'

/**
 * Git config variables the caller's environment must not apply to the owner lookup: config they
 * add, such as an `insteadOf` rule, rewrites the remote, so the owner read would not be the
 * repository's own. Git itself exports `GIT_CONFIG_PARAMETERS` (from `-c`) to hooks and aliases,
 * so they leak into a tool by accident. `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM` and
 * `GIT_CONFIG_NOSYSTEM` are kept on purpose: they are deliberate user setup, like
 * `~/.gitconfig`, whose `insteadOf` rules still apply.
 */
const GIT_CONFIG_VAR = /^GIT_CONFIG(?:$|_COUNT$|_PARAMETERS$|_KEY_\d+$|_VALUE_\d+$)/

/**
 * `git` for a lookup that runs before the repository is trusted, where `.git/config` belongs to
 * whoever made the directory:
 * - `core.fsmonitor` off. `remote get-url` does not run fsmonitor today; the flag keeps it so;
 * - without typed-git's `REPOSITORY_VARS` (`GIT_DIR` and the others a git hook exports), which
 *   would point git at another repository (`withoutRepositoryVars`);
 * - without the inherited config variables above;
 * - with hooks off (typed-git's `hooksOffEnv`), as pr-update runs git in a repository it does not
 *   trust.
 *
 * Each variable is unset in the child only: command-seam drops a variable set to `undefined`.
 */
function lookupGit(git: CommandRunner): CommandRunner {
  const cleared = withoutRepositoryVars(git)
  return {
    binary: 'git',
    run: (argv, opts) => {
      const config = Object.keys(process.env).filter((name) => GIT_CONFIG_VAR.test(name))
      const env = {
        ...Object.fromEntries(config.map((name) => [name, undefined])),
        ...hooksOffEnv({}),
        ...opts.env,
      }
      return cleared.run(['-c', 'core.fsmonitor=false', ...argv], { ...opts, env })
    },
  }
}

/** A remote git reads as a URL (`scheme://...`) or as scp-style (`[user@]host:path`). */
const URL_REMOTE = /^[a-z][a-z0-9+.-]*:\/\//i
const SCP_REMOTE = /^(?:[^@/:\s]+@)?[^@/:\s]+:(?!\/\/)/
/**
 * hosted-git-info shortcuts (`github:owner/repo`), matched case-insensitively
 * because `parseGitUrl` reads `GitHub://x/owner/repo` as GitHub too. Git reads
 * `github:owner/repo` as scp-style ssh to a host called `github`, and
 * `github://...` as a URL for a `git-remote-github` helper. Neither is the
 * hosted site, so they have no owner here.
 */
const SHORTCUT_REMOTE = /^(?:github|gitlab|bitbucket|gist|sourcehut):/i

/**
 * `root`'s `origin` remote host and owner as `host/owner`
 * (`github.com/acme`), or null when there is none we can read. The host is
 * part of the answer because the same owner name on another host is another
 * account.
 * Git runs in `root` with the caller's git location and config variables
 * removed, so they cannot point it at another repository, and with hooks off. Git still searches
 * upward from `root`, so a directory without its own `.git` inside a
 * repository gets that repository's owner. A remote that is neither a URL nor
 * scp-style is a local path (`owner/repo` is one) and has no owner. A host
 * hosted-git-info does not know (a self-hosted server) has no owner either.
 * `git` is for tests; it defaults to the real binary.
 * @experimental
 */
export function originOwner(
  root: string,
  git: CommandRunner = spawnRunner('git', { absolutePathOnly: true }),
): string | null {
  const res = new Git(root, { runner: lookupGit(git) }).try.remoteGetUrl('origin')
  if (!res.ok || res.value === null) return null
  if (SHORTCUT_REMOTE.test(res.value)) return null
  if (!URL_REMOTE.test(res.value) && !SCP_REMOTE.test(res.value)) return null
  const info = parseGitUrl(res.value)
  return info?.user && info.project ? `${info.domain}/${info.user}` : null
}
