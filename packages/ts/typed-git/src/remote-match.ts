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
 * form git reads when a colon comes before any slash.
 */
export function isSshRemote(url: string): boolean {
  if (/^(?:ssh|git\+ssh|ssh\+git):\/\//i.test(url)) return true
  return !url.includes('://') && /^[^/]+:/.test(url)
}

/**
 * A remote URL read as `{host, owner, repo}`, as {@link parseRemoteRepo}
 * reads it, but with an SSH config alias replaced by the host ssh's config
 * gives for it (`git@github-work:o/r.git` or `git@github.com-work:o/r.git`).
 * The resolved host is normalised as `parseRemoteRepo` normalises a written
 * one: lower-cased, `ssh.github.com` as `github.com`, and `www.gitlab.com`
 * as `gitlab.com`.
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
  // Read the resolved host through parseRemoteRepo, so it gets the same
  // normalising as a host written in the URL: lower case, `ssh.github.com` as
  // `github.com`, and `www.` dropped from a host hosted-git-info knows.
  const parsed = parseRemoteRepo(`ssh://git@${target}/${remote.owner}/${remote.repo}.git`)
  return { ...remote, host: parsed?.host ?? canonicalHost(target) }
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
