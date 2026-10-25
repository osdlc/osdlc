/**
 * The page's calls to the server. Every action but Run is a command of the
 * tree, sent to `POST /api/commands/<command>` with a JSON body of its flags
 * and positionals, exactly as `way <command> --json` would run it. Run is
 * `POST /run`, which resolves the task with `way run --dry-run`. Which
 * command each action is lives in `../actions.ts`, where a test checks it.
 */

import type { Unknown } from '../core/unknowns.ts'
import { APP } from '../app.ts'
import { $, state, type CatalogDocument, type ToolInfo } from './state.ts'
import {
  escapeHtml,
  render,
  renderStatus,
  renderTrustBar,
  scopedReports,
  showSignedOut,
  taskRows,
} from './view.ts'

// ---------------------------------------------------------------- auth

/** Where the bearer token is kept for this tab. */
export const TOKEN_KEY = `${APP}.token`

/**
 * The bearer token, from `POST /session`. Kept in `sessionStorage` as well,
 * so a reload stays signed in: it is per tab, ends with the tab, and is never
 * sent with a request or put in a URL. A cookie would be sent with every
 * request, and `localStorage` would outlive the tab.
 */
let token = stored()

function stored(): string {
  try {
    return globalThis.sessionStorage?.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

function keep(value: string): void {
  token = value
  try {
    if (value === '') globalThis.sessionStorage?.removeItem(TOKEN_KEY)
    else globalThis.sessionStorage?.setItem(TOKEN_KEY, value)
  } catch {
    // Storage off: the token lasts until a reload.
  }
}

/**
 * Trade the one-shot boot token for the bearer token. False when the boot
 * token is used, expired or wrong, or the server is gone.
 */
export async function signIn(boot: string): Promise<boolean> {
  try {
    const res = await fetch('/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ boot }),
      cache: 'no-store',
    })
    if (!res.ok) return false
    const body = (await res.json()) as { token?: unknown }
    if (typeof body.token !== 'string') return false
    keep(body.token)
    return true
  } catch {
    return false
  }
}

/** Whether the page holds a token: from a sign-in, or kept from before a reload. */
export function signedIn(): boolean {
  return token !== ''
}

/**
 * Whether the kept token still works, asked without signing out on a 401.
 * The page asks before it spends a boot token, so a tab that is already
 * signed in never redeems one a second time.
 */
export async function tokenWorks(): Promise<boolean> {
  if (token === '') return false
  try {
    const res = await fetch('/api/commands/config/path', {
      method: 'POST',
      headers: authHeaders({ 'content-type': 'application/json' }),
      body: '{}',
      cache: 'no-store',
    })
    return res.status !== 401
  } catch {
    return false
  }
}

/**
 * Forget the token and show the signed-out page. For a 401: the server was
 * restarted, so the kept token is not its token.
 */
export function signOut(): void {
  keep('')
  showSignedOut()
}

/** For tests: set the token without a server. */
export function setTokenForTest(value: string): void {
  keep(value)
}

function authHeaders(extra: Record<string, string> = {}): Headers {
  const headers = new Headers(extra)
  headers.set('authorization', `Bearer ${token}`)
  return headers
}

/**
 * What a command call answered. `status` 0 means no answer: the server is
 * gone, most often because a run took the terminal. A 428 carries the
 * `nonce` to send back once the person has confirmed.
 */
export type CallResult<T> =
  | { ok: true; doc: T }
  | { ok: false; status: number; message: string; hint?: string; code?: string; nonce?: string }

/**
 * Run `way <words...>` with `args`, the JSON form of its flags and
 * positionals. `confirm` is the nonce of a confirmed 428.
 */
export async function call<T>(
  words: readonly string[],
  args: Record<string, unknown> = {},
  confirm?: string,
): Promise<CallResult<T>> {
  let res: Response
  try {
    res = await fetch('/api/commands/' + words.map(encodeURIComponent).join('/'), {
      method: 'POST',
      headers: authHeaders({
        'content-type': 'application/json',
        ...(confirm !== undefined ? { 'x-confirm': confirm } : {}),
      }),
      body: JSON.stringify(args),
      cache: 'no-store',
    })
  } catch {
    return { ok: false, status: 0, message: 'the server is gone' }
  }
  if (res.status === 401) signOut()
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (res.ok && body !== null) return { ok: true, doc: body as T }
  const text = (key: string): string | undefined =>
    typeof body?.[key] === 'string' ? (body[key] as string) : undefined
  return {
    ok: false,
    status: res.status,
    message: text('message') ?? `the server answered ${res.status}`,
    ...(text('hint') !== undefined ? { hint: text('hint')! } : {}),
    ...(text('code') !== undefined ? { code: text('code')! } : {}),
    ...(text('nonce') !== undefined ? { nonce: text('nonce')! } : {}),
  }
}

/** A failed call as one line a person reads: the message, then the hint. */
export function failureText(result: { message: string; hint?: string }): string {
  return result.hint === undefined ? result.message : `${result.message} (${result.hint})`
}

function showError(prefix: string, detail: string): void {
  $('status').innerHTML = '<span class="err">' + escapeHtml(prefix + ': ' + detail) + '</span>'
}

// ---------------------------------------------------------------- catalog

/** Whether a withheld runner would be read once the repository, or a tool it runs, is trusted. */
function trustableFrom(unknowns: readonly Unknown[]): boolean {
  return unknowns.some(
    (u) => u.kind === 'withheld' && (u.reason === 'untrusted' || u.reason === 'tool-untrusted'),
  )
}

/**
 * Pull the catalog with `way list`.
 *
 * `cached` answers from the stored probe, so the first view appears at once
 * on a repository whose slowest runner takes seconds; `state.cache` says
 * which rows those were. Everything else probes every runner.
 *
 * The fingerprint check stops an unchanged poll from resetting the scroll
 * position and open groups.
 */
export async function load(opts: { cached?: boolean } = {}): Promise<void> {
  if (state.loading) return
  state.loading = true
  const result = await call<CatalogDocument>(['list'], opts.cached === true ? { cached: true } : {})
  state.loading = false
  if (!result.ok) {
    showError(
      'refresh failed',
      result.status === 0 ? 'the server is gone (is it still running?)' : failureText(result),
    )
    return
  }
  const cat = result.doc
  const fp = JSON.stringify([
    cat.reports.map((s) => [
      s.runner,
      s.status,
      s.tasks.map((e) => e.display + ' ' + (e.doc || '') + ' ' + (e.parametersUnknown ?? '')),
    ]),
    cat.unknowns?.map((u) => u.label),
    cat.skills?.map((s) => [s.id, s.argumentHint, s.description, s.harnesses]),
    cat.trustedTools,
  ])
  state.checkedAt = cat.generatedAt
  state.cache = cat.cache ?? []
  state.unknowns = cat.unknowns ?? []
  state.trustable = trustableFrom(state.unknowns)
  if (fp === state.fingerprint && state.catalog) {
    // Nothing moved: advance the clock, leave the table and scroll alone.
    state.catalog = cat
    const inScope = scopedReports().reduce((n, s) => n + s.tasks.length, 0)
    renderStatus(taskRows().length, inScope)
    renderTrustBar()
    return
  }
  state.fingerprint = fp
  state.catalog = cat
  render()
}

// ---------------------------------------------------------------- trust

/** What the person is asked before a grant is sent. */
export const TRUST_QUESTION =
  'Trust this repository? Its runners will be read by running them, now and on every later visit, until you untrust it.'

/** What the person is asked before one tool's grant is sent. */
export function toolTrustQuestion(tool: string): string {
  return `Trust ${tool} in this repository? Runners that run it will be read by running it, now and on every later visit, until you untrust it.`
}

/**
 * What a grant came to. `declined` is the person saying no; nothing was sent
 * a second time.
 */
export type GrantResult = { ok: true } | { ok: false; declined: boolean; detail: string }

/**
 * Send a `way trust` grant. The server answers 428 with a nonce, the person
 * is asked, and only then is the same request sent again with the nonce.
 */
async function grant(
  args: Record<string, unknown>,
  question: string,
  ask: (question: string) => boolean,
): Promise<GrantResult> {
  const first = await call<unknown>(['trust'], args)
  if (!first.ok && (first.status !== 428 || first.nonce === undefined)) {
    return { ok: false, declined: false, detail: failureText(first) }
  }
  if (!first.ok) {
    if (!ask(question)) return { ok: false, declined: true, detail: 'not confirmed' }
    const second = await call<unknown>(['trust'], args, first.nonce)
    if (!second.ok) return { ok: false, declined: false, detail: failureText(second) }
  }
  // The next probe runs trusted, so the withheld runners appear.
  state.fingerprint = ''
  await load()
  return { ok: true }
}

/**
 * Grant trust with `way trust`, confirmed by the person. Returns true when
 * the grant was made.
 */
export async function trustRepo(ask: (question: string) => boolean = confirm): Promise<boolean> {
  const result = await grant({}, TRUST_QUESTION, ask)
  if (!result.ok && !result.declined) showError('trust failed', result.detail)
  return result.ok
}

/** Remove the repository's trust with `way trust --untrust`. */
export async function untrustRepo(): Promise<{ ok: boolean; detail?: string }> {
  return untrust({ untrust: true })
}

/** Trust one tool with `way trust --scope <tool>`, confirmed by the person. */
export function trustTool(
  tool: string,
  ask: (question: string) => boolean = confirm,
): Promise<GrantResult> {
  return grant({ scope: tool }, toolTrustQuestion(tool), ask)
}

/** Remove one tool's trust with `way trust --untrust --scope <tool>`. */
export function untrustTool(tool: string): Promise<{ ok: boolean; detail?: string }> {
  return untrust({ untrust: true, scope: tool })
}

async function untrust(args: Record<string, unknown>): Promise<{ ok: boolean; detail?: string }> {
  const result = await call<unknown>(['trust'], args)
  if (!result.ok) return { ok: false, detail: failureText(result) }
  state.fingerprint = ''
  await load()
  return { ok: true }
}

// ---------------------------------------------------------------- tools

/** Read every tool's description, language and homepage with `way providers`. */
export async function loadTools(): Promise<void> {
  const result = await call<{ providers: ToolInfo[] }>(['providers'])
  if (!result.ok) return
  state.tools = result.doc.providers.map((p) => ({
    id: p.id,
    homepage: p.homepage,
    description: p.description,
    ecosystem: p.ecosystem,
    language: p.language,
  }))
}

// ---------------------------------------------------------------- config

/** One setting, as `way config list --json` gives it. */
export interface Setting {
  key: string
  value: unknown
  source: string
}

/** What the settings screen reads. */
export interface ConfigView {
  settings: Setting[]
  /** Each layer's file: `user` and `project`. */
  locations: { layer: string; path: string; exists: boolean }[]
  /** Whether the trust store or the user's trust policy trusts this repository. */
  trusted: boolean
  /** What decided it: `marker`, `path` or `owner`. */
  trustedBy: string | null
}

/**
 * Read the settings with `way config list` and the trust with `way trust
 * --show`. Null when either fails.
 */
export async function readConfig(): Promise<ConfigView | null> {
  const [list, trust] = await Promise.all([
    call<{ settings: Setting[]; locations: ConfigView['locations'] }>(['config', 'list']),
    call<{ roots: { trusted: boolean; by: string | null }[] }>(['trust'], { show: true }),
  ])
  if (!list.ok || !trust.ok) return null
  const root = trust.doc.roots[0]
  return {
    settings: list.doc.settings,
    locations: list.doc.locations,
    trusted: root?.trusted === true,
    trustedBy: root?.by ?? null,
  }
}

/** A setting's value in `view`. */
export function settingValue(view: ConfigView | null, key: string): unknown {
  return view?.settings.find((s) => s.key === key)?.value
}

/** A setting's source in `view`: `default`, `user` or `project`. */
export function settingSource(view: ConfigView | null, key: string): string {
  return view?.settings.find((s) => s.key === key)?.source ?? 'default'
}

/** What `config set` answers. */
export interface Written {
  key: string
  value: unknown
  layer: string
  file: string
}

/** Write one setting with `way config set <key> <json> --<layer>`. */
export function setSetting(
  key: string,
  value: unknown,
  layer: 'user' | 'project',
): Promise<CallResult<Written>> {
  return call<Written>(['config', 'set'], { key, value: JSON.stringify(value), [layer]: true })
}

/** Remove one setting with `way config unset <key> --<layer>`. */
export function unsetSetting(
  key: string,
  layer: 'user' | 'project',
): Promise<CallResult<{ key: string; layer: string; file: string }>> {
  return call(['config', 'unset'], { key, [layer]: true })
}

// ---------------------------------------------------------------- run

/**
 * The result of a run request. `taken` is the server's 409: another run got
 * the terminal first. `gone` is the same case seen as a closed connection
 * instead of a status: the server already stopped and handed off the
 * terminal. `failed` is anything else, with the reason.
 */
export type RunResult =
  | { outcome: 'handed-off'; command: string }
  | { outcome: 'taken' }
  | { outcome: 'gone' }
  | { outcome: 'failed'; detail: string }

/**
 * Ask the server to hand its terminal to a task, as `way run <id> -- <args>`
 * does. The id selects the task, and `args` are its trailing arguments. The
 * binary, the leading arguments and the cwd never come from the page.
 */
export async function requestRun(id: string, args: readonly string[] = []): Promise<RunResult> {
  let res: Response
  try {
    res = await fetch('/run', {
      method: 'POST',
      headers: authHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ id, args }),
      cache: 'no-store',
    })
  } catch {
    // No answer: the server is stopping to hand over the terminal.
    return { outcome: 'gone' }
  }
  if (res.status === 409) return { outcome: 'taken' }
  if (res.status === 401) signOut()
  const body = (await res.json().catch(() => null)) as {
    argv?: string[]
    display?: string
    message?: string
    hint?: string
  } | null
  if (!res.ok) {
    const message = body?.message ?? `the server answered ${res.status}`
    return {
      outcome: 'failed',
      detail: failureText({ message, ...(body?.hint !== undefined ? { hint: body.hint } : {}) }),
    }
  }
  return { outcome: 'handed-off', command: body?.argv?.join(' ') || body?.display || 'the task' }
}
