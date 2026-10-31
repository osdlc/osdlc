/**
 * What the sweep must know about a repository before it can classify anything:
 * where its main checkout is, what its default branch is called, which remote
 * to measure against, and which provider can be asked about pull requests.
 */

import { parseRemoteRepo, type Git } from '@osdlc/typed-git'
import type { CommandRunner } from '@osdlc/command-seam'
import type { Gh } from '@osdlc/typed-gh'

import {
  forgeTarget,
  probeProvider,
  providers,
  type PrProvider,
  type ProviderChoice,
  type ProviderName,
} from './providers/index.ts'
import type { RepoInfo } from './types.ts'

/**
 * Thrown when a path names no repository, or names one whose default branch
 * cannot be determined. A single-repository caller lets it propagate; a
 * fan-out catches it and records an error row, because one unreadable
 * repository must not end the sweep.
 */
export class DiscoveryFailed extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DiscoveryFailed'
  }
}

/**
 * Read `hint`'s repository.
 *
 * The root is normalised through `--git-common-dir`, so pointing the sweep at
 * a linked worktree inventories the repository that worktree belongs to. The
 * default branch comes from the remote's own HEAD, falling back to probing
 * `main` then `master` — a remote whose HEAD was never set is an ordinary
 * state, not a failure.
 */
export function discoverRepo(
  hint: string,
  opts: {
    remote?: string | null
    /** False is `provider: 'none'`, whatever `provider` says. */
    allowGh?: boolean
    /** Which provider to ask for pull requests. Defaults to `auto`, by the remote's host. */
    provider?: ProviderChoice | undefined
    git: Git
    gh: Gh
    /** The `glab` runner for the GitLab provider. Defaults to the real binary. */
    glab?: CommandRunner | undefined
    /** The providers to choose from. Defaults to {@link providers} over `gh` and `glab`. */
    providers?: Record<ProviderName, PrProvider> | undefined
  },
): RepoInfo {
  const { git, gh } = opts
  const remoteHint = opts.remote ?? null
  const allowGh = opts.allowGh ?? true

  // `topLevel()` answers null for exit 128 only — "this is not a repository",
  // which is the answer to the question. Any other git failure throws.
  const top = git.at(hint).topLevel()
  if (top === null) throw new DiscoveryFailed(`not a git repository: ${hint}`)

  // Pointing the sweep at a linked worktree inventories the repository that
  // worktree belongs to, not the worktree alone.
  const root = git.at(top).mainCheckout() ?? top

  // We are provably inside a repository by now, so a failure here is a
  // failure, not "no remotes".
  const remotes = git.at(root).remote()
  let remote: string | null = null
  if (remoteHint !== null && remotes.includes(remoteHint)) remote = remoteHint
  if (remote === null) {
    if (remotes.includes('origin')) remote = 'origin'
    else if (remotes.length > 0) remote = remotes[0]!
  }

  let mainBranch = ''
  if (remote !== null) {
    // Null when the remote's HEAD was never set — an ordinary state, not a
    // failure; fall through to the main/master probe.
    const head = git.at(root).symbolicRef(`refs/remotes/${remote}/HEAD`)
    const prefix = `refs/remotes/${remote}/`
    if (head?.startsWith(prefix)) mainBranch = head.slice(prefix.length)
  }
  if (!mainBranch) {
    for (const candidate of ['main', 'master']) {
      if (git.at(root).resolveRef(candidate) !== null) {
        mainBranch = candidate
        break
      }
    }
  }
  if (!mainBranch) throw new DiscoveryFailed(`could not determine the default branch of ${root}`)

  // A short name for the report's header, so a fan-out over long paths stays
  // readable. It also keys duplicate checkouts.
  const url = remote === null ? null : git.at(root).try.remoteGetUrl(remote)
  const slug = url === null ? null : remoteSlugOf(url)
  const remoteUrl = url?.ok === true && typeof url.value === 'string' ? url.value : null

  const currentBranch = git.at(root).headRef() ?? ''

  // Installed and signed in are probed separately: "not installed" and "not
  // authenticated" send a person somewhere different.
  const choice: ProviderChoice = allowGh ? (opts.provider ?? 'auto') : 'none'
  const target = forgeTarget(remoteUrl)
  const provider = probeProvider(
    choice,
    root,
    target,
    opts.providers ?? providers({ gh, glab: opts.glab }),
  )
  const hasGh = provider?.available ?? false
  const ghAuthenticated = provider?.authenticated ?? false

  return {
    root,
    slug,
    mainBranch,
    remote,
    currentBranch,
    provider,
    hasGh,
    ghAuthenticated,
    fetched: false,
  }
}

/**
 * `owner/name` for a github.com remote, `host/owner/name` for any other, or
 * null when the URL names no repository. The host keeps two hosts' `a/b`
 * apart.
 */
function remoteSlugOf(url: { ok: boolean; value?: string | null }): string | null {
  if (!url.ok || url.value === undefined || url.value === null) return null
  const remote = parseRemoteRepo(url.value)
  if (remote === null) return null
  const slug = `${remote.owner}/${remote.repo}`
  return remote.host === 'github.com' ? slug : `${remote.host}/${slug}`
}
