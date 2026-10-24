import type { Catalog, RunnerCacheState } from '@osdlc/system-model/detect'

import { TOKEN_HEADER } from '../app.ts'

import { $, state } from './state.ts'
import {
  escapeHtml,
  listRows,
  render,
  renderStatus,
  renderTrustBar,
  scopedReports,
} from './view.ts'

/**
 * The catalog, plus two things the page cannot work out for itself.
 *
 * `trustable` comes from the server's own trust decision, not from the
 * repository's files. `cache` is where each runner's rows came from. The
 * server may answer from its store so the page appears at once, and this
 * says when it did.
 */
type CatalogResponse = Catalog & {
  trustable?: boolean
  cache?: RunnerCacheState[]
  /** Set on a trust grant that leaves something for the next start. */
  note?: string
}

// ---------------------------------------------------------------- auth

/**
 * The session token the server embedded in this page, read once at import.
 *
 * Kept in module state only. localStorage, sessionStorage and cookies either
 * outlive the tab or are sent with requests the page did not make. Module
 * state ends with the page, which is the lifetime the token should have.
 */
const token: string = (globalThis as { __WAYFINDER_TOKEN__?: string }).__WAYFINDER_TOKEN__ ?? ''

/**
 * Every server call goes through here, the one place the token is attached.
 *
 * The endpoints are on loopback, which any process on this machine and any
 * page the user visits can reach, so reads and writes both carry the token.
 * Send new endpoints through here. A request without the token gets a 401.
 */
export function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set(TOKEN_HEADER, token)
  return fetch(path, { ...init, headers, cache: 'no-store' })
}

/**
 * What `/api/config` answers: the merged configuration, the two layers that
 * produced it, and which layer supplied each leaf.
 *
 * `sources` is keyed by dotted path (`runners.disabled`, `allowExec`), as
 * `way config` names keys, so the screen and the CLI use the same names. The
 * server converts it from a Map, which would serialise as `{}`.
 */
export interface ConfigResponse {
  effective: Record<string, unknown>
  project: Record<string, unknown> | null
  user: Record<string, unknown> | null
  sources: Record<string, 'default' | 'user' | 'project'>
  locations: { project: string; user: string }
  warnings: string[]
  trusted: boolean
  trustable: boolean
}

/** Read this project's configuration, or null when the request fails. */
export async function getConfig(): Promise<ConfigResponse | null> {
  try {
    const res = await authFetch('/api/config')
    if (!res.ok) return null
    return (await res.json()) as ConfigResponse
  } catch {
    // The server is gone (a run took the terminal) or the page is offline.
    // The dialog says so, rather than showing an empty screen that looks like
    // a project with no configuration.
    return null
  }
}

/**
 * Write staged settings to the project file, and read back what that produced.
 *
 * A patch of dotted keys, named as `way config set` names them. The server
 * applies it to the file's raw contents, so a key this version does not know
 * survives the save (see `writeProjectConfig` in serve.ts).
 *
 * On success it returns the config as it now is in the file, so the screen
 * re-renders from the file in one round trip.
 */
export async function saveConfig(
  set: Record<string, unknown>,
): Promise<{ ok: true; config: ConfigResponse } | { ok: false; detail: string }> {
  try {
    const res = await authFetch('/api/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ set }),
    })
    // A refusal's body is written for a person ("allowExec: true cannot be
    // written to a project file …"), so it is shown instead of the status.
    if (!res.ok)
      return { ok: false, detail: (await res.text()) || `the server answered ${res.status}` }
    return { ok: true, config: (await res.json()) as ConfigResponse }
  } catch (err) {
    return { ok: false, detail: err instanceof TypeError ? 'the server is gone' : String(err) }
  }
}

// ---------------------------------------------------------------- data

/**
 * Grant this repository trust, then re-render from what comes back.
 *
 * The server returns a freshly probed catalog with the grant already applied,
 * so the runners appear in one round trip rather than after the next poll.
 */
export async function trustRepo(): Promise<void> {
  try {
    const res = await authFetch('/api/trust', { method: 'POST' })
    if (!res.ok) {
      // Never silent. The click asked for something with consequences, so a
      // refusal must be as visible as a failed refresh.
      $('status').innerHTML =
        '<span class="err">trust failed: ' +
        escapeHtml(await res.text()) +
        ' (HTTP ' +
        res.status +
        ')</span>'
      return
    }
    const cat = (await res.json()) as CatalogResponse
    state.catalog = cat
    state.trustable = cat.trustable === true
    state.cache = cat.cache ?? []
    state.checkedAt = cat.generatedAt
    state.fingerprint = ''
    render()
    if (cat.note !== undefined) $('status').textContent = cat.note
  } catch (err) {
    $('status').innerHTML =
      '<span class="err">trust failed: ' +
      escapeHtml(String(err)) +
      ' (is the server still running?)</span>'
  }
}

/**
 * Revoke this repository's trust.
 *
 * The store then says not trusted. The running session keeps the execution
 * setting it decided at start. See the DELETE branch in serve.ts for why the
 * server does not guess whether that came from the store or from `--exec`.
 * The caller says so, rather than implying a revoke that did not happen.
 */
export async function untrustRepo(): Promise<{ ok: boolean; detail?: string }> {
  try {
    const res = await authFetch('/api/trust', { method: 'DELETE' })
    if (!res.ok)
      return { ok: false, detail: (await res.text()) || `the server answered ${res.status}` }
    const cat = (await res.json()) as CatalogResponse
    state.catalog = cat
    state.trustable = cat.trustable === true
    state.cache = cat.cache ?? []
    render()
    return { ok: true }
  } catch (err) {
    return { ok: false, detail: err instanceof TypeError ? 'the server is gone' : String(err) }
  }
}

/**
 * The result of a run request. `taken` is the server's 409: another run got
 * the terminal first. `gone` is the same case seen as a closed connection
 * instead of a status: the server already stopped and handed off the
 * terminal. `failed` is anything unexpected.
 */
export type RunResult =
  | { outcome: 'handed-off'; command: string }
  | { outcome: 'taken' }
  | { outcome: 'gone' }
  | { outcome: 'failed'; detail: string }

/**
 * Ask the server to hand its terminal to a task.
 *
 * The id selects the command. `args` are the trailing arguments a recipe with
 * parameters needs (`staging` for `just deploy <env>`). The server looks the
 * task up in the catalog it built and adds these. The binary, the leading
 * arguments and the cwd never come from the page, because anything that can
 * reach the port could send a command.
 */
export async function requestRun(id: string, args: readonly string[] = []): Promise<RunResult> {
  try {
    const res = await authFetch('/api/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, args }),
    })
    if (res.status === 409) return { outcome: 'taken' }
    // A 404 is the one failure whose body is written for a person: the row was
    // in a listing served from the cache and the task is gone. Showing only the
    // status code would drop the one sentence that explains why a row on
    // screen cannot be run.
    if (res.status === 404) {
      const detail = await res.text().catch(() => '')
      return { outcome: 'failed', detail: detail || 'the server answered 404' }
    }
    if (!res.ok) return { outcome: 'failed', detail: 'the server answered ' + res.status }
    const body = (await res.json()) as { display?: string; argv?: string[] }
    return { outcome: 'handed-off', command: body.argv?.join(' ') || body.display || 'the task' }
  } catch (err) {
    // fetch rejects with a TypeError when the request got no answer. That is
    // the usual result of losing this race, because the server is stopping to
    // hand over the terminal. The browser's message ("Failed to fetch") tells
    // the user nothing, so it is dropped and the outcome says what happened.
    // Anything else (a body that did not parse) is unexpected and keeps its
    // detail.
    if (err instanceof TypeError) return { outcome: 'gone' }
    return { outcome: 'failed', detail: String(err) }
  }
}

/**
 * Pull the catalog.
 *
 * `force` is the Refresh button, and it always runs a real probe of every
 * runner, since a refresh answered from a store is not a refresh. An unforced
 * call (first view, focus, the poll) takes the newest answer the server has.
 * On the first request that is the stored answer, with a probe already
 * running in the background. `state.cache` says which rows those were.
 *
 * The fingerprint check stops an unchanged poll from resetting the scroll
 * position and open groups.
 */
export async function load(force: boolean): Promise<void> {
  if (state.loading) return
  state.loading = true
  try {
    const res = await authFetch('/api/catalog' + (force ? '?force=1' : ''))
    if (!res.ok) throw new Error(`the server answered ${res.status}`)
    const cat = (await res.json()) as CatalogResponse
    const fp = JSON.stringify(
      cat.reports.map((s) => [
        s.runner,
        s.status,
        s.tasks.map((e) => e.display + ' ' + (e.doc || '')),
      ]),
    )
    state.loading = false
    state.checkedAt = cat.generatedAt
    state.trustable = cat.trustable === true
    state.cache = cat.cache ?? []
    if (fp === state.fingerprint && state.catalog) {
      // Nothing moved: advance the clock, leave the table and scroll alone.
      const inScope = scopedReports().reduce((n, s) => n + s.tasks.length, 0)
      // `listRows`, not a document-wide sweep: the settings dialog draws its
      // runner list as a table too, and its rows are not commands.
      renderStatus(listRows().length, inScope)
      // Also on an unchanged poll: trusting the repository in another window
      // changes what is withheld without changing any row.
      renderTrustBar()
      return
    }
    state.fingerprint = fp
    state.catalog = cat
    render()
  } catch (err) {
    state.loading = false
    $('status').innerHTML =
      '<span class="err">refresh failed: ' +
      escapeHtml(String(err)) +
      ' (is the server still running?)</span>'
  }
}
