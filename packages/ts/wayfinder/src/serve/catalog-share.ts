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
 *   - `list --join` (the page's first read and its polls) joins a probe
 *     already running. A plain `list` (Refresh) always starts a probe, so it
 *     never answers with one that began before an edit.
 *
 * A shared probe runs on a signal this module owns. A request that stops
 * waiting (a closed tab) leaves on its own; the probe stops only when nobody
 * waits for it, or when the server stops. A failed probe fails every waiter
 * and is forgotten, so the next request starts again.
 *
 * An entry is used only by a request whose session has the same view key
 * (trust and settings), so a trust grant or a saved setting is never answered
 * with rows from before it. Only unfiltered listings are shared.
 */

import type { CatalogBody } from '../commands/list.ts'

/** See the module comment. One per command tree; `serve` turns it on. */
export interface CatalogShare {
  /** True once `serve` has started, until it stops. The command line never shares. */
  readonly active: boolean
  /** Aborted when the server stops. Sessions that run shared probes use it. */
  readonly signal: AbortSignal
  activate(): void
  /** Stop every shared probe and share nothing more. */
  stop(): void
  /** Keep `body` as the newest catalog for `key`. */
  remember(key: string, body: CatalogBody): void
  /** The newest catalog for `key`, marked as cached, or null. */
  cached(key: string): CatalogBody | null
  /**
   * A fresh catalog for `key`. With `join`, the probe already running for it
   * when there is one; otherwise `probe` starts now. `probe` gets the
   * share's signal, not the caller's. `signal` is the caller's own: when it
   * aborts, this call rejects and the probe goes on for the other waiters.
   */
  fresh(
    key: string,
    probe: (signal: AbortSignal) => Promise<CatalogBody>,
    opts: { join: boolean; signal?: AbortSignal | undefined },
  ): Promise<CatalogBody>
  /** How many callers wait on the running probe for `key`. For tests. */
  waiting(key: string): number
}

interface Running {
  key: string
  /** Starting order: an older probe's answer never replaces a newer one's. */
  seq: number
  controller: AbortController
  promise: Promise<CatalogBody>
  waiters: number
  settled: boolean
}

export function createCatalogShare(): CatalogShare {
  let active = false
  const stopper = new AbortController()
  let latest: { key: string; seq: number; body: CatalogBody } | null = null
  let running: Running | null = null
  let seq = 0

  const start = (key: string, probe: (signal: AbortSignal) => Promise<CatalogBody>): Running => {
    const controller = new AbortController()
    const onStop = (): void => controller.abort(stopper.signal.reason)
    stopper.signal.addEventListener('abort', onStop, { once: true })
    const run: Running = {
      key,
      seq: ++seq,
      controller,
      promise: Promise.resolve().then(() => probe(controller.signal)),
      waiters: 0,
      settled: false,
    }
    running = run
    const done = (): void => {
      run.settled = true
      stopper.signal.removeEventListener('abort', onStop)
      if (running === run) running = null
    }
    run.promise.then((body) => {
      done()
      if (!controller.signal.aborted && (latest === null || latest.seq < run.seq)) {
        latest = { key, seq: run.seq, body }
      }
    }, done)
    return run
  }

  const wait = (run: Running, signal: AbortSignal | undefined): Promise<CatalogBody> =>
    new Promise<CatalogBody>((resolve, reject) => {
      let left = false
      run.waiters++
      const leave = (): void => {
        if (left) return
        left = true
        run.waiters--
        signal?.removeEventListener('abort', onAbort)
        if (run.waiters === 0 && !run.settled) run.controller.abort(new Error('nobody is waiting'))
      }
      const onAbort = (): void => {
        leave()
        reject(signal?.reason ?? new Error('aborted'))
      }
      if (signal?.aborted === true) return onAbort()
      signal?.addEventListener('abort', onAbort, { once: true })
      run.promise.then(
        (body) => {
          leave()
          resolve(body)
        },
        (err: unknown) => {
          leave()
          reject(err)
        },
      )
    })

  return {
    get active() {
      return active && !stopper.signal.aborted
    },
    signal: stopper.signal,
    activate() {
      active = true
    },
    stop() {
      active = false
      stopper.abort(new Error('the server stopped'))
    },
    remember(key, body) {
      latest = { key, seq: latest?.seq ?? 0, body }
    },
    cached(key) {
      if (latest === null || latest.key !== key) return null
      const body = latest.body
      return body.source === 'cached'
        ? body
        : { ...body, source: 'cached', storedAt: body.generatedAt }
    },
    fresh(key, probe, opts) {
      const joinable = running !== null && running.key === key && !running.settled
      const run = opts.join && joinable ? running! : start(key, probe)
      return wait(run, opts.signal)
    },
    waiting(key) {
      return running !== null && running.key === key ? running.waiters : 0
    },
  }
}
