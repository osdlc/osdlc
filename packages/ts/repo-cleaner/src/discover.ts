/**
 * What the sweep must know about a repository before it can classify anything:
 * where its main checkout is, its default remote and branch, the remotes whose
 * branches it judges and their default branches, and which provider can be
 * asked about each remote's pull requests.
 */

import { parseRemoteRepo, type Git } from '@osdlc/typed-git'
import type { CommandRunner } from '@osdlc/command-seam'
import type { Gh } from '@osdlc/typed-gh'

import {
  chooseProvider,
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
 * a linked worktree inventories the repository that worktree belongs to.
 *
 * The default remote is `origin`, else the remote the local default branch
 * tracks, else the only remote; a repository with several remotes and none of
 * those has none. The local default branch comes from the default remote's
 * own HEAD, falling back to probing `main` then `master` — a remote whose HEAD
 * was never set is an ordinary state, not a failure.
 *
 * `remotes` names the remotes whose branches are judged: a name, `''` for the
 * default remote, `*` for every remote. A name the repository lacks, or `''`
 * where several remotes leave no default, fails the repository; `''` in a
 * repository with no remote names none. Their default branches are
 * read here when their refs are on disk; {@link resolveRemoteDefaults} reads
 * the rest after the fetch.
 */
export function discoverRepo(
  hint: string,
  opts: {
    /** The remotes whose branches are judged. Default none. */
    remotes?: readonly string[] | undefined
    /** The remote whose default branch every row is judged against instead. */
    against?: string | null | undefined
    /** False is `provider: 'none'`, whatever `provider` says. */
    allowProvider?: boolean
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
  const allowProvider = opts.allowProvider ?? true

  // `topLevel()` answers null for exit 128 only — "this is not a repository",
  // which is the answer to the question. Any other git failure throws.
  const top = git.at(hint).topLevel()
  if (top === null) throw new DiscoveryFailed(`not a git repository: ${hint}`)

  // Pointing the sweep at a linked worktree inventories the repository that
  // worktree belongs to, not the worktree alone.
  const root = git.at(top).mainCheckout() ?? top
  const at = git.at(root)

  // We are provably inside a repository by now, so a failure here is a
  // failure, not "no remotes".
  const all = at.remote()
  const remote = defaultRemote(at, all)

  let mainBranch = remote === null ? null : remoteHead(at, remote)
  if (mainBranch === null) {
    for (const candidate of ['main', 'master']) {
      if (at.resolveRef(candidate) !== null) {
        mainBranch = candidate
        break
      }
    }
  }
  if (mainBranch === null) {
    throw new DiscoveryFailed(`could not determine the default branch of ${root}`)
  }

  const names: string[] = []
  for (const asked of opts.remotes ?? []) {
    if (asked === '*') names.push(...all)
    else if (asked === '') {
      // A repository with no remote has no remote branches, which is no error
      // in a sweep across many checkouts.
      if (remote === null && all.length === 0) continue
      if (remote === null) {
        throw new DiscoveryFailed(
          `${root} has no default remote (no origin, and ${all.length} remotes); name one with --remote=<name>`,
        )
      }
      names.push(remote)
    } else if (all.includes(asked)) names.push(asked)
    else throw new DiscoveryFailed(`${root} has no remote named ${asked}`)
  }
  const against = opts.against ?? null
  if (against !== null && !all.includes(against)) {
    throw new DiscoveryFailed(`--against ${against}: ${root} has no remote of that name`)
  }

  // Installed and signed in are probed separately: "not installed" and "not
  // authenticated" send a person somewhere different.
  const choice: ProviderChoice = allowProvider ? (opts.provider ?? 'auto') : 'none'
  const known = opts.providers ?? providers({ gh, glab: opts.glab })
  const scoped = [...new Set(names)]
  const urls = new Map(
    [...new Set([...(remote === null ? [] : [remote]), ...scoped])].map((name) => {
      const url = at.try.remoteGetUrl(name)
      return [name, url] as const
    }),
  )
  const urlOf = (name: string): string | null => {
    const url = urls.get(name)
    return url?.ok === true && typeof url.value === 'string' ? url.value : null
  }
  if (choice === 'github' || choice === 'gitlab') {
    const kinds = new Set(
      scoped
        .map((name) => chooseProvider('auto', forgeTarget(urlOf(name))))
        .filter((k) => k !== null),
    )
    if (kinds.size > 1) {
      throw new DiscoveryFailed(
        `--provider ${choice} would ask one forge about remotes on ${[...kinds].join(' and ')} hosts; leave --provider at auto`,
      )
    }
  }
  // With no default remote, the local rows' provider is the one `choice`
  // names for no host: none for `auto`.
  const probe = (name: string | null) =>
    probeProvider(choice, root, forgeTarget(name === null ? null : urlOf(name)), known)

  // A short name for the report's header, so a fan-out over long paths stays
  // readable. It also keys duplicate checkouts.
  const slug = remote === null ? null : remoteSlugOf(urls.get(remote)!)
  const provider = probe(remote)

  return {
    root,
    slug,
    mainBranch,
    remote,
    currentBranch: at.headRef() ?? '',
    provider,
    fetched: false,
    fetchedRemotes: [],
    remotes: scoped.map((name) => ({
      name,
      defaultBranch: name === remote ? mainBranch : (remoteDefault(at, name) ?? ''),
      slug: remoteSlugOf(urls.get(name)!),
      provider: name === remote ? provider : probe(name),
      fetched: false,
    })),
    against:
      against === null
        ? null
        : {
            remote: against,
            branch: against === remote ? mainBranch : (remoteDefault(at, against) ?? ''),
          },
  }
}

/**
 * `info` with every default branch it could not read before the fetch read
 * now. Throws {@link DiscoveryFailed} for one still unknown: a remote's
 * default branch is never a candidate, so the sweep must know which it is.
 */
export function resolveRemoteDefaults(info: RepoInfo, git: Git): RepoInfo {
  const at = git.at(info.root)
  const known = (name: string, branch: string): string => {
    if (branch !== '') return branch
    const found = remoteDefault(at, name)
    if (found === null) {
      throw new DiscoveryFailed(
        `could not tell the default branch of remote ${name}; set it with \`git remote set-head ${name} --auto\``,
      )
    }
    return found
  }
  return {
    ...info,
    remotes: info.remotes.map((r) => ({ ...r, defaultBranch: known(r.name, r.defaultBranch) })),
    against:
      info.against === null
        ? null
        : { ...info.against, branch: known(info.against.remote!, info.against.branch) },
  }
}

/** `origin`, else the remote the local `main` or `master` tracks, else the only remote; null otherwise. */
function defaultRemote(at: Git, all: readonly string[]): string | null {
  if (all.includes('origin')) return 'origin'
  for (const branch of ['main', 'master']) {
    const tracked = at.configGet(`branch.${branch}.remote`)
    if (tracked && all.includes(tracked)) return tracked
  }
  return all.length === 1 ? all[0]! : null
}

/** What `refs/remotes/<remote>/HEAD` points at, or null when it was never set. */
function remoteHead(at: Git, remote: string): string | null {
  const head = at.symbolicRef(`refs/remotes/${remote}/HEAD`)
  const prefix = `refs/remotes/${remote}/`
  return head?.startsWith(prefix) === true ? head.slice(prefix.length) : null
}

/** {@link remoteHead}, else `main`, then `master`, where the remote has them; null for none. */
function remoteDefault(at: Git, remote: string): string | null {
  const head = remoteHead(at, remote)
  if (head !== null) return head
  for (const candidate of ['main', 'master']) {
    if (at.resolveRef(`refs/remotes/${remote}/${candidate}`) !== null) return candidate
  }
  return null
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
