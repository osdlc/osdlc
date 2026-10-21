/**
 * Choosing a `CodeHost` for the repository at `cwd`, from its `origin` remote.
 *
 * A GitHub remote is the only case this package can name outright — a
 * self-hosted Forgejo instance lives at an operator-chosen domain, so "not
 * github.com" is the whole positive test for Forgejo. The `code_host.override`
 * config key exists for the cases this heuristic gets wrong (a GitHub
 * Enterprise host) or cannot answer at all (no `origin` remote configured,
 * which falls back to GitHub — this port's only adapter before this task,
 * so a repository this heuristic can't read a remote for keeps behaving
 * exactly as it did).
 *
 * Callers use `selectCodeHost` instead of constructing `GithubCodeHost`
 * directly — this is the one place that decision gets made, so no caller ever branches on a `CodeHost`'s name. A doctor command uses
 * `resolveCodeHost` and `authChecksFor` to run the chosen backend's auth checks.
 */

import { Git, parseRemoteUrl, type RemoteCoordinate } from '@osdlc/typed-git'

import { spawnRunner, type CommandRunner } from '@osdlc/command-seam'
import { DEFAULT_FORGEJO_TOKEN_ENV, ForgejoCodeHost } from './forgejo.ts'
import { forgejoAuthChecks } from './forgejo-auth.ts'
import { GithubCodeHost } from './github.ts'
import { githubAuthChecks } from './github-auth.ts'
import type { AuthCheck, CodeHost, CodeHostAuthCheckDeps, CodeHostName } from './types.ts'

/**
 * Pure: which code host `url` (an `origin` remote, or null when this checkout
 * has none) names, honoring an explicit `override` first.
 */
export function codeHostNameForRemote(
  url: string | null,
  override: CodeHostName | null,
): CodeHostName {
  if (override !== null) return override
  if (url === null) return 'github'
  return url.includes('github.com') ? 'github' : 'forgejo'
}

/**
 * Strips embedded `user:pass@`/`user@` userinfo from a `https://`/`ssh://`
 * remote URL before it goes anywhere this run might log or surface it (a
 * thrown error's `message` ends up in a terminal, a crash report, an
 * orchestrator log line — none of them the credential's intended audience).
 * A remote that failed {@link parseRemoteUrl} is exactly the shape most
 * likely to carry one: `parseRemoteUrl` already strips a plain `user@` for
 * the shapes it DOES recognize, so what reaches here is whatever it could
 * not make sense of, embedded credentials included.
 */
function redactRemoteUrl(url: string): string {
  return url.replace(/(^[a-z][a-z0-9+.-]*:\/\/)[^/@]+@/i, '$1***@')
}

/**
 * `ForgejoCodeHost` takes one `host` string and builds `https://${host}/...`.
 * Folding the port in here makes that URL hit a non-default port, and it is
 * the shape `ForgejoCodeHost.parsePrUrl`'s host compare expects (a PR URL's
 * authority includes `:port` too).
 */
function forgejoHost(ref: RemoteCoordinate): string {
  return ref.port !== null ? `${ref.host}:${ref.port}` : ref.host
}

/** The backend name for the repository at `cwd`, and the `origin` URL it was read from. */
export function resolveCodeHost(
  cwd: string,
  gitRunner: CommandRunner,
  override: CodeHostName | null,
): { name: CodeHostName; remoteUrl: string | null } {
  // `.try`: a checkout outside a repository, or any other git failure reading
  // `origin`, means no remote, not an error.
  const remoteOutcome = new Git(cwd, { runner: gitRunner }).try.remoteGetUrl('origin')
  const remoteUrl = remoteOutcome.ok ? remoteOutcome.value : null
  return { name: codeHostNameForRemote(remoteUrl, override), remoteUrl }
}

/** Per-call options for a backend's auth checks; GitHub ignores them. */
interface AuthChecksOptions {
  /** Env var the Forgejo token is read from; `FORGEJO_TOKEN` when omitted. */
  forgejoTokenEnv?: string
}

type AuthChecks = (
  deps: CodeHostAuthCheckDeps,
  remoteUrl: string | null,
  opts?: AuthChecksOptions,
) => Promise<AuthCheck[]>

/** Each backend's auth checks, given the `origin` URL. Adding a backend adds one entry. */
const AUTH_CHECKS: Record<CodeHostName, AuthChecks> = {
  github: async (deps, remoteUrl) => githubAuthChecks(deps, remoteUrl),
  forgejo: (deps, remoteUrl, opts) => {
    const ref = remoteUrl === null ? null : parseRemoteUrl(remoteUrl)
    return forgejoAuthChecks(
      deps,
      ref === null ? null : `https://${forgejoHost(ref)}`,
      opts?.forgejoTokenEnv,
    )
  },
}

export function authChecksFor(
  name: CodeHostName,
  opts: AuthChecksOptions = {},
): (deps: CodeHostAuthCheckDeps, remoteUrl: string | null) => Promise<AuthCheck[]> {
  return (deps, remoteUrl) => AUTH_CHECKS[name](deps, remoteUrl, opts)
}

/**
 * Build the `CodeHost` for the repository at `cwd`. Throws when a Forgejo
 * adapter is needed but cannot be built (no readable remote, or no token).
 *
 * Two SEPARATE runners in, not one: `git`/`gh`/`curl` are each bound to a
 * specific binary in this package (`spawnRunner('git')`, `spawnRunner('gh')`,
 * ...), unlike a generic subprocess runner that takes the binary name as
 * part of its argv. `opts.git` resolves the `origin` remote; `opts.gh`
 * becomes `GithubCodeHost`'s runner when that is the answer; `opts.curl`
 * (optional — a real one is spawned when omitted) becomes `ForgejoCodeHost`'s,
 * so a test can fake the one call this function makes to a binary neither
 * `ctx.git` nor `ctx.gh` already covers, with no real subprocess.
 */
export function selectCodeHost(
  cwd: string,
  opts: {
    git: CommandRunner
    gh: CommandRunner
    curl?: CommandRunner
    override?: CodeHostName | null
    /** Env var the Forgejo token is read from; `FORGEJO_TOKEN` when omitted. */
    forgejoTokenEnv?: string
  },
): CodeHost {
  const { name, remoteUrl } = resolveCodeHost(cwd, opts.git, opts.override ?? null)
  if (name === 'github') return new GithubCodeHost(cwd, { runner: opts.gh })

  if (remoteUrl === null) {
    throw new Error('selectCodeHost: no `origin` remote to build a Forgejo adapter from')
  }
  const ref = parseRemoteUrl(remoteUrl)
  if (ref === null) {
    throw new Error(
      `selectCodeHost: could not parse a host/owner/repo from the origin remote (${redactRemoteUrl(remoteUrl)})`,
    )
  }
  const hostForAdapter = forgejoHost(ref)
  const tokenEnv = opts.forgejoTokenEnv ?? DEFAULT_FORGEJO_TOKEN_ENV
  const token = process.env[tokenEnv]
  if (token === undefined || token === '') {
    throw new Error(
      `selectCodeHost: this run needs a Forgejo adapter for ${hostForAdapter}, but ${tokenEnv} is not set`,
    )
  }
  const curlRunner = opts.curl ?? spawnRunner('curl')
  return new ForgejoCodeHost({
    runner: curlRunner,
    cwd,
    host: hostForAdapter,
    owner: ref.owner,
    repo: ref.repo,
    token,
  })
}
