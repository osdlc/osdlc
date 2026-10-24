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
 * `trustable` is the server's own reading of the gate it resolved, not
 * something inferred from the repository's files. `cache` is where each
 * runner's rows came from — the server may answer out of its store so the page
 * appears at once, and this is what admits it.
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
 * Module state and nothing else. localStorage, sessionStorage and cookies all
 * outlive the tab or ride along on requests the page did not make; this dies
 * with the page, which is the lifetime it should have.
 */
const token: string = (globalThis as { __WAYPOST_TOKEN__?: string }).__WAYPOST_TOKEN__ ?? ''

/**
 * Every server call goes through here — the one place the token is attached.
 *
 * The endpoints are on loopback, which any process on this machine and any
 * page the user is visiting can reach, so reads and mutations alike carry the
 * token. Route new endpoints through here; one that skips it gets a 401,
 * which is the point.
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
 * `sources` is keyed by DOTTED path (`runners.disabled`, `allowExec`) because
 * that is what `way config` names, so the screen and the CLI say the same
 * thing about the same key. The server converts it from a Map; a Map would
 * have serialised as `{}`.
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
    // The dialog says so rather than rendering an empty screen that looks
    // like a project with no configuration.
    return null
  }
}

/**
 * Write staged settings to the project file, and read back what that produced.
 *
 * A PATCH of dotted keys, matching what `way config set` names. The server
 * applies it to the file's raw contents, so a key this version does not know
 * survives the save — see `writeProjectConfig` in serve.ts.
 *
 * The success arm carries the config as it now IS rather than as the caller
 * hoped: one round trip, and the screen re-renders from the file.
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
    // A refusal's body is written for a person — "allowExec: true cannot be
    // written to a project file …" — so it is shown rather than the status.
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
      // Never silent: the click asked for something with consequences, so a
      // refusal has to be as visible as a failed refresh.
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
 * The store is the durable answer and this makes it `false`. The RUNNING
 * session keeps whatever execution gate it resolved at startup — see the
 * DELETE branch in serve.ts for why the server will not guess whether that
 * came from the store or from an explicit `--exec`. The caller shows that
 * rather than implying a revoke the process did not perform.
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
 * What a run request came back as. `taken` is the server's 409 — one run wins,
 * and this one did not. `gone` is the same story told by the socket instead of
 * by a status line: the server that would have answered has already left with
 * the terminal. `failed` is everything genuinely unexpected.
 */
export type RunResult =
  | { outcome: 'handed-off'; command: string }
  | { outcome: 'taken' }
  | { outcome: 'gone' }
  | { outcome: 'failed'; detail: string }

/**
 * Ask the server to hand its terminal to a task.
 *
 * The id selects the command; `args` is the tail a parameterised recipe needs
 * (`staging` for `just deploy <env>`). The server looks the task up in the
 * catalog it built itself and APPENDS these — the binary, the leading
 * arguments and the cwd never come from here, because a command sent from this
 * side would be a command the server was told to run by whatever could reach
 * the port.
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
    // in a listing the server served out of its cache and the task is not there
    // any more. Showing the status code instead would drop the only sentence
    // that explains why a row on screen cannot be run.
    if (res.status === 404) {
      const detail = await res.text().catch(() => '')
      return { outcome: 'failed', detail: detail || 'the server answered 404' }
    }
    if (!res.ok) return { outcome: 'failed', detail: 'the server answered ' + res.status }
    const body = (await res.json()) as { display?: string; argv?: string[] }
    return { outcome: 'handed-off', command: body.argv?.join(' ') || body.display || 'the task' }
  } catch (err) {
    // fetch rejects with a TypeError when the request never got an answer at
    // all — the normal shape of losing this race, because the winner's server
    // is on its way out with the terminal. It is the browser's own wording
    // ("Failed to fetch"), which says nothing a user can act on, so the
    // outcome carries the meaning and the string is dropped. Anything else
    // (a body that did not parse) is a real surprise and keeps its detail.
    if (err instanceof TypeError) return { outcome: 'gone' }
    return { outcome: 'failed', detail: String(err) }
  }
}

/**
 * Pull the catalog.
 *
 * `force` is the Refresh button, and it is always a real probe of every runner
 * — an explicit refresh that could be answered from a store is not a refresh.
 * An unforced call (first paint, focus, the poll) takes whatever the server has
 * freshest, which on the very first request is the stored answer with a probe
 * already running behind it; `state.cache` says which rows those were.
 *
 * The fingerprint check keeps an unchanged poll from blowing away scroll
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
      // The unchanged-poll path too: a repository trusted in another
      // window changes what is withheld without changing a single row.
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
