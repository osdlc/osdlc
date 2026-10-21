import { DEFAULT_FORGEJO_TOKEN_ENV } from './forgejo.ts'
import type { AuthCheck, CodeHostAuthCheckDeps } from './types.ts'

const TIMEOUT_MS = 5000

/**
 * The token env var (`tokenEnv`, `FORGEJO_TOKEN` by default) is set, and
 * `GET <baseUrl>/api/v1/user` accepts it. One network call, skipped when the
 * token or `baseUrl` is missing.
 */
export async function forgejoAuthChecks(
  deps: CodeHostAuthCheckDeps,
  baseUrl: string | null,
  tokenEnv: string = DEFAULT_FORGEJO_TOKEN_ENV,
): Promise<AuthCheck[]> {
  const token = deps.env[tokenEnv]
  const hasToken = token !== undefined && token !== ''
  const checks: AuthCheck[] = [
    {
      name: `${tokenEnv} set`,
      ok: hasToken,
      fix: `export ${tokenEnv}=<token from Settings → Applications>`,
    },
  ]
  if (baseUrl === null) {
    checks.push({
      name: 'forgejo host',
      ok: false,
      detail: 'no parseable origin remote',
      fix: 'set an origin remote that points at the Forgejo host',
    })
    return checks
  }
  if (!hasToken) return checks

  const url = `${baseUrl}/api/v1/user`
  const failure = await getUserFailure(deps.fetch ?? fetch, url, token)
  checks.push({
    name: `GET ${url}`,
    ok: failure === null,
    ...(failure !== null ? { detail: failure } : {}),
    fix: `token rejected or host unreachable: create a new token and re-export ${tokenEnv}`,
  })
  return checks
}

/** Why the request did not return HTTP 200, or null when it did. */
async function getUserFailure(
  fetchFn: typeof fetch,
  url: string,
  token: string,
): Promise<string | null> {
  try {
    const res = await fetchFn(url, {
      headers: { Authorization: `token ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return res.status === 200 ? null : `HTTP ${res.status}`
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}
