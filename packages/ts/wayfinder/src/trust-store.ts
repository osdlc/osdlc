/**
 * The trust store, with the old waypost store read as a fallback.
 *
 * Grants live in `$XDG_STATE_HOME/wayfinder/trusted/`. A grant made before the
 * rename sits in `$XDG_STATE_HOME/waypost/trusted/` and still counts:
 * `isTrusted`, `list` and `listGrants` read both stores, `trust` writes only
 * the new one, and `untrust`, `untrustAll` and `tighten` act on both, so a
 * revoked grant cannot survive in the old store. `dir`, `markerPath` and
 * `resolveRoot` are the new store's.
 */

import { trustStore, WHOLE_REPO_SCOPE, type TrustGrant, type TrustStore } from '@osdlc/trust-repo'

import { LEGACY_TRUST_STORE_TOOL, TRUST_STORE_TOOL } from './config.ts'

export interface AppTrustStoreOptions {
  /** Defaults to `process.env`. Supplies `XDG_STATE_HOME`. */
  env?: Record<string, string | undefined>
  /** Defaults to `homeDir()` from `@osdlc/trust-repo`. The base for the non-XDG state path. */
  home?: string
}

/** Sorts as trust-repo's `listGrants` does: by root, then scope, with `*` first. */
function grantKey(g: TrustGrant): string {
  return `${g.root}\0${g.scope === WHOLE_REPO_SCOPE ? '' : g.scope}`
}

function sortScopes(scopes: string[]): string[] {
  return scopes.sort((a, b) =>
    compare(a === WHOLE_REPO_SCOPE ? '' : a, b === WHOLE_REPO_SCOPE ? '' : b),
  )
}

/** Code-unit order, as `Array.prototype.sort` uses. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
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
    async untrustAll(root) {
      const removed = new Set([
        ...(await current.untrustAll(root)),
        ...(await legacy.untrustAll(root)),
      ])
      return sortScopes([...removed])
    },
    async list() {
      const paths = new Set([...(await current.list()), ...(await legacy.list())])
      return [...paths].sort()
    },
    // A grant in both stores is listed once, with the new store's marker.
    async listGrants() {
      const seen = new Set<string>()
      const grants: TrustGrant[] = []
      for (const grant of [...(await current.listGrants()), ...(await legacy.listGrants())]) {
        const key = `${grant.root}\0${grant.scope}`
        if (seen.has(key)) continue
        seen.add(key)
        grants.push(grant)
      }
      return grants.sort((a, b) => compare(grantKey(a), grantKey(b)))
    },
    async tighten() {
      return [...(await current.tighten()), ...(await legacy.tighten())]
    },
  }
}
