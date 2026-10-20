/**
 * Offline sign-in evidence.
 *
 * Only evidence on this machine counts: a credentials file exists, a JSON file
 * has a key, or an API-key variable is set. No value is read into the report:
 * the evidence names a path, `path#key` or a variable name. Only positive
 * evidence is reported. A missing file proves nothing, because a login can live
 * in a keychain, so everything else is `'unknown'`.
 *
 * Runtime-agnostic: pure over the {@link ProviderContext}.
 */

import type { ProviderContext } from '../contract.ts'
import type { Auth } from '../report.ts'

/** No positive evidence. A new object each call, so no two reports share one. */
export function unknownAuth(): Auth {
  return { signedIn: 'unknown', evidence: null, providers: null }
}

/** Where to look, in order. */
export interface AuthSources {
  /** Credential files whose existence counts. Absolute. */
  files?: readonly string[]
  /** JSON files and the top-level key whose presence counts. */
  keys?: readonly { path: string; key: string }[]
  /** Variables whose being set counts. */
  env?: readonly string[]
}

/** The first positive evidence among `sources`; `'unknown'` in `project` mode or when there is none. */
export function authEvidence(ctx: ProviderContext, sources: AuthSources): Auth {
  if (ctx.mode === 'project') return unknownAuth()
  const file = (sources.files ?? []).find((f) => ctx.exists(f) && !ctx.isDirectory(f))
  if (file !== undefined) return { signedIn: true, evidence: file, providers: null }
  for (const { path, key } of sources.keys ?? []) {
    const read = ctx.readJson(path)
    if (read.status === 'parsed' && Object.hasOwn(read.value, key)) {
      return { signedIn: true, evidence: `${path}#${key}`, providers: null }
    }
  }
  const variable = (sources.env ?? []).find((name) => (ctx.env[name] ?? '') !== '')
  if (variable !== undefined) return { signedIn: true, evidence: variable, providers: null }
  return unknownAuth()
}
