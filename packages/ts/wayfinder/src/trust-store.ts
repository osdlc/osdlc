/**
 * The trust store, with the old waypost store read as a fallback.
 *
 * Grants live in `$XDG_STATE_HOME/wayfinder/trusted/`. A grant made before the
 * rename sits in `$XDG_STATE_HOME/waypost/trusted/` and still counts:
 * `isTrusted` and `list` read both stores, `trust` writes only the new one,
 * and `untrust` removes the root from both, so a revoked grant cannot survive
 * in the old store. The other members read only the new store.
 */

import { trustStore, type TrustStore } from '@osdlc/trust-repo'

import { LEGACY_TRUST_STORE_TOOL, TRUST_STORE_TOOL } from './config.ts'

export interface AppTrustStoreOptions {
  /** Defaults to `process.env`. Supplies `XDG_STATE_HOME`. */
  env?: Record<string, string | undefined>
  /** Defaults to `os.homedir()`. The base for the non-XDG state path. */
  home?: string
}

/** The app's trust store: the wayfinder store, plus grants from the waypost one. */
export function appTrustStore(opts: AppTrustStoreOptions = {}): TrustStore {
  const scope = {
    ...(opts.env !== undefined ? { env: opts.env } : {}),
    ...(opts.home !== undefined ? { home: opts.home } : {}),
  }
  const current = trustStore({ tool: TRUST_STORE_TOOL, ...scope })
  const legacy = trustStore({ tool: LEGACY_TRUST_STORE_TOOL, ...scope })

  return {
    ...current,
    async isTrusted(root, scope) {
      return (await current.isTrusted(root, scope)) || (await legacy.isTrusted(root, scope))
    },
    async trust(root, scope) {
      const result = await current.trust(root, scope)
      if (result.alreadyTrusted) return result
      // Granted again under the new name: still reported as already trusted
      // when the old store held the grant, since nothing changed for the user.
      return (await legacy.isTrusted(root, scope)) ? { ...result, alreadyTrusted: true } : result
    },
    async untrust(root, scope) {
      const removedCurrent = await current.untrust(root, scope)
      const removedLegacy = await legacy.untrust(root, scope)
      return removedCurrent || removedLegacy
    },
    async list() {
      const paths = new Set([...(await current.list()), ...(await legacy.list())])
      return [...paths].sort()
    },
  }
}
