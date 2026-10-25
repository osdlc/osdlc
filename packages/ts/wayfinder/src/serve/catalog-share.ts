/**
 * The catalog the web view's server holds between requests.
 *
 * Each request opens its own session, as a CLI run does. Without this, the
 * page's first `list --cached` would read the store again (seconds on a large
 * repository) right after `serve` read it, and every poll would start its
 * own probe. With it:
 *
 *   - `list --cached` answers with the newest catalog the server holds, marked
 *     `source: "cached"`.
 *   - `list` joins a probe already running, and starts one otherwise.
 *
 * An entry is used only by a request whose session has the same view key
 * (trust and settings), so a trust grant or a saved setting is never answered
 * with rows from before it. Only unfiltered listings are shared.
 */

import type { CatalogBody } from '../commands/list.ts'

/** See the module comment. One per command tree; `serve` turns it on. */
export interface CatalogShare {
  /** True once `serve` has started. The command line never shares. */
  readonly active: boolean
  activate(): void
  /** Keep `body` as the newest catalog for `key`. */
  remember(key: string, body: CatalogBody): void
  /** The newest catalog for `key`, marked as cached, or null. */
  cached(key: string): CatalogBody | null
  /**
   * A fresh catalog for `key`: the probe already running for it, or
   * `probe()`. Its answer becomes the newest. A failed probe is not kept.
   */
  fresh(key: string, probe: () => Promise<CatalogBody>): Promise<CatalogBody>
}

export function createCatalogShare(): CatalogShare {
  let active = false
  let latest: { key: string; body: CatalogBody } | null = null
  let running: { key: string; promise: Promise<CatalogBody> } | null = null
  return {
    get active() {
      return active
    },
    activate() {
      active = true
    },
    remember(key, body) {
      latest = { key, body }
    },
    cached(key) {
      if (latest === null || latest.key !== key) return null
      const body = latest.body
      return body.source === 'cached'
        ? body
        : { ...body, source: 'cached', storedAt: body.generatedAt }
    },
    fresh(key, probe) {
      if (running !== null && running.key === key) return running.promise
      const promise = probe().then((body) => {
        latest = { key, body }
        return body
      })
      const entry = { key, promise }
      running = entry
      const clear = (): void => {
        if (running === entry) running = null
      }
      promise.then(clear, clear)
      return promise
    },
  }
}
