/**
 * Chooses a `CodeHost` for the repository at `cwd`, from its `origin` remote.
 *
 * GitHub is the only host this package can recognize by its domain. A
 * self-hosted Forgejo instance can live at any domain, so any remote that does
 * not contain `github.com` is taken as Forgejo. With no `origin` remote the
 * answer is GitHub. The `code_host.override` config key covers the cases this
 * rule gets wrong, such as a GitHub Enterprise host.
 *
 * Callers use `selectCodeHost` instead of constructing an adapter directly.
 * This is the one place the choice is made, so no caller branches on a
 * `CodeHost`'s name. A doctor command uses `resolveCodeHost` and
 * `authChecksFor` to run the chosen backend's auth checks.
 */

import { Git, parseRemoteUrl, type RemoteCoordinate } from '@osdlc/typed-git'

import { spawnRunner, type CommandRunner } from '@osdlc/command-seam'
import { err, ok, type Result } from '@osdlc/result'
import type { CodeHostFailure } from './failure.ts'
import { DEFAULT_FORGEJO_TOKEN_ENV, ForgejoCodeHost } from './forgejo.ts'
import { forgejoAuthChecks } from './forgejo-auth.ts'
import { GithubCodeHost } from './github.ts'
import { githubAuthChecks } from './github-auth.ts'
import type { AuthCheck, CodeHost, CodeHostAuthCheckDeps, CodeHostName } from './types.ts'

/**
 * Which code host `url` names. `url` is the `origin` remote, or null when the
 * checkout has none. An explicit `override` wins. Pure.
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
 * Strips `user:pass@` or `user@` from a `scheme://` remote URL before it is
 * shown or logged. An error's `message` can end up in a terminal, a crash
 * report or a log line, and none of those should see a credential. A remote
 * that {@link parseRemoteUrl} could not read is the one most likely to still
 * carry credentials, because `parseRemoteUrl` strips `user@` only from the
 * forms it recognizes.
 */
function redactRemoteUrl(url: string): string {
  return url.replace(/(^[a-z][a-z0-9+.-]*:\/\/)[^/@]+@/i, '$1***@')
}

/**
 * `ForgejoCodeHost` takes one `host` string and builds `https://${host}/...`.
 * Adding the port here makes that URL reach a non-default port. It is also the
 * form `ForgejoCodeHost.parsePrUrl` compares hosts in, since a PR URL's
 * authority includes `:port` too.
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
 * The failure for a remote whose URL names no host, owner and repository. The
 * URL is redacted of any credentials first, since the message reaches a terminal.
 */
export function badRemoteFailure(host: CodeHostName, remote: string, url: string): CodeHostFailure {
  return {
    kind: 'bad-remote',
    message: `The \`${remote}\` remote (${redactRemoteUrl(url)}) names no host, owner and repository.`,
    hint: 'Point it at the repository, such as https://git.example.com/owner/repo.git.',
    host,
  }
}

/**
 * Builds the `CodeHost` for the repository at `cwd`. A Forgejo adapter that
 * cannot be built is a failure, not a throw: `no-remote` (no `origin`),
 * `bad-remote` (a remote that names no host, owner and repo) or
 * `missing-token`. Building is a query about the checkout and the
 * environment, so it returns a `Result<CodeHost, CodeHostFailure>` like the
 * port's queries.
 *
 * Each runner is bound to one binary (`spawnRunner('git')`,
 * `spawnRunner('gh')`, ...), so there is one option per binary. `opts.git`
 * reads the `origin` remote. `opts.gh` becomes `GithubCodeHost`'s runner.
 * `opts.curl` becomes `ForgejoCodeHost`'s runner. It is optional, and a real
 * `curl` runner is used when it is omitted. A test passes a fake to run
 * without a subprocess.
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
): Result<CodeHost, CodeHostFailure> {
  const { name, remoteUrl } = resolveCodeHost(cwd, opts.git, opts.override ?? null)
  if (name === 'github') return ok(new GithubCodeHost(cwd, { runner: opts.gh }))

  if (remoteUrl === null) {
    return err({
      kind: 'no-remote',
      message: 'There is no `origin` remote to read the Forgejo repository from.',
      hint: 'Run it inside a clone with an `origin` remote.',
      host: 'forgejo',
    })
  }
  const ref = parseRemoteUrl(remoteUrl)
  if (ref === null) return err(badRemoteFailure('forgejo', 'origin', remoteUrl))
  const hostForAdapter = forgejoHost(ref)
  const tokenEnv = opts.forgejoTokenEnv ?? DEFAULT_FORGEJO_TOKEN_ENV
  const token = process.env[tokenEnv]
  if (token === undefined || token === '') {
    return err({
      kind: 'missing-token',
      message: `Forgejo at ${hostForAdapter} needs a token, but ${tokenEnv} is not set.`,
      hint: `Set ${tokenEnv} to a valid token.`,
      host: 'forgejo',
    })
  }
  const curlRunner = opts.curl ?? spawnRunner('curl')
  return ok(
    new ForgejoCodeHost({
      tokenEnv,
      runner: curlRunner,
      cwd,
      host: hostForAdapter,
      owner: ref.owner,
      repo: ref.repo,
      token,
    }),
  )
}
