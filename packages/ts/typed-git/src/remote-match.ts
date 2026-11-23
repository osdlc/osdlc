/**
 * Reading a remote into the repository it names when its host is an SSH
 * config alias, and deciding whether two remotes name one repository.
 *
 * `parseRemoteRepo` takes a host as written. A remote such as
 * `git@github-work:acme/widgets.git` names a `Host` entry in the SSH config,
 * the usual setup for two accounts on one forge, and only ssh knows the host
 * behind it. {@link readRemote} asks `ssh -G`, as `gh` does.
 */

import { homedir } from 'node:os'

import { spawnRunner, type CommandRunner } from '@osdlc/command-seam'

import { canonicalHost, parseRemoteRepo, type RemoteRepo } from './git-url.ts'
import { scpParts } from './remote-url.ts'

/** A repository to match: owner and repo, and its host when that is known. */
export type RepoCoordinate = Pick<RemoteRepo, 'owner' | 'repo'> & { host?: string | undefined }

/** Looks up the host an SSH config alias stands for; null when it stands for none. */
export type SshAliasResolver = (alias: string) => string | null

/**
 * A resolver that asks `ssh -G` for the host an alias stands for, and caches
 * each answer for the life of the resolver. Null when ssh is missing, fails,
 * or maps the alias to itself.
 *
 * `runner` runs `ssh`. It defaults to command-seam's `spawnRunner`, which
 * finds `ssh` on absolute `PATH` entries only, as the git clients do for
 * `git`. ssh runs from the home directory with a 5 s limit, so a slow or
 * prompting config cannot hang the caller.
 */
export function sshAliasResolver(
  runner: CommandRunner = spawnRunner('ssh', { absolutePathOnly: true }),
): SshAliasResolver {
  const cache = new Map<string, string | null>()
  return (alias) => {
    const cached = cache.get(alias)
    if (cached !== undefined) return cached
    // `--`: a host can start with `-`, which ssh would read as an option.
    const out = runner.run(['-G', '--', alias], { cwd: homedir(), timeoutMs: 5_000 })
    const named = out.exitCode === 0 ? /^hostname (\S+)$/m.exec(out.stdout)?.[1] : undefined
    const host = named === undefined || named.toLowerCase() === alias.toLowerCase() ? null : named
    cache.set(alias, host)
    return host
  }
}

/** The resolver {@link readRemote} uses unless given another, so its cache lasts the process. */
const defaultResolver: SshAliasResolver = sshAliasResolver()

/**
 * Whether `url` is an SSH remote: `ssh://…` (or git's `git+ssh://` and
 * `ssh+git://` spellings), or the scp-like `[user@]host:path`
 * form git reads when a colon comes before any slash. With no user, a single
 * letter before the colon is a Windows drive (`C:/x`, `C:\\x`), on every
 * platform, as git reads it on Windows.
 */
export function isSshRemote(url: string): boolean {
  if (/^(?:ssh|git\+ssh|ssh\+git):\/\//i.test(url)) return true
  return scpParts(url) !== null
}

/**
 * A remote URL read as `{host, owner, repo}`, as {@link parseRemoteRepo}
 * reads it, but with an SSH config alias replaced by the host ssh's config
 * gives for it (`git@github-work:o/r.git` or `git@github.com-work:o/r.git`).
 * The result is what the same URL written with the resolved host reads as:
 * the host lower-cased, `ssh.github.com` as `github.com` and
 * `www.gitlab.com` as `gitlab.com`, and a GitLab nested group whole in
 * `owner` (`group/sub`).
 *
 * ssh is asked only for an SSH remote whose host is not `github.com`. The
 * hosts of other URL schemes are taken as written, and an alias ssh cannot
 * resolve keeps its own name. Pass `resolveAlias` to answer without ssh; the
 * default runs `ssh -G` through {@link sshAliasResolver}.
 */
export function readRemote(
  url: string,
  resolveAlias: SshAliasResolver = defaultResolver,
): RemoteRepo | null {
  const remote = parseRemoteRepo(url)
  if (remote === null || remote.host === 'github.com' || !isSshRemote(url)) return remote
  const target = resolveAlias(remote.host)
  if (target === null) return remote
  // Read the URL again with only the host replaced, so the result is what
  // the same remote written with the real host reads as: the host normalised
  // (lower case, `ssh.github.com` as `github.com`, `www.` dropped from a host
  // hosted-git-info knows), and a nested group whole in `owner` on a host it
  // knows. The alias host is unknown to it, so `remote` kept only the last
  // two path segments.
  const path = sshPath(url)
  const parsed = path === null ? null : parseRemoteRepo(`ssh://git@${target}/${path}`)
  return parsed ?? { ...remote, host: canonicalHost(target) }
}

/**
 * The repository path of an SSH remote, without a leading `/`: the part
 * after the host of `ssh://[user@]host[:port]/path` (and its `git+ssh://`
 * and `ssh+git://` spellings), or after the colon of `[user@]host:path`.
 */
function sshPath(url: string): string | null {
  const text = url.trim()
  const path = (
    /^(?:ssh|git\+ssh|ssh\+git):\/\/(?:[^@/]+@)?[^/]+\/(.+)$/i.exec(text)?.[1] ??
    scpParts(text)?.path
  )?.replace(/^\/+/, '')
  return path === undefined || path === '' ? null : path
}

/**
 * Whether `a` and `b` name one repository: owner and repo in any letter case,
 * and the host too when both name one.
 */
export function sameRepo(a: RepoCoordinate, b: RepoCoordinate): boolean {
  if (a.host !== undefined && b.host !== undefined && a.host.toLowerCase() !== b.host.toLowerCase())
    return false
  return (
    a.owner.toLowerCase() === b.owner.toLowerCase() && a.repo.toLowerCase() === b.repo.toLowerCase()
  )
}
