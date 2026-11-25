/**
 * The `ollama` plugin: models nobody has pulled or changed for a while.
 *
 * Detected when `ollama` is on PATH and its server answers. Each model
 * `ollama list` shows is an `ollama-model:<name>` ref, deleted with
 * `ollama rm`, and costs a re-download. Its idle time is the MODIFIED column,
 * which ollama writes as rounded text ("4 days ago"), so the threshold is held
 * against the least time that text can mean. A model younger than the
 * threshold, or whose time or size cannot be read, is held for review. That
 * time is when it was pulled, not when it was last run, so every model also
 * gets an {@link OLLAMA_USE_UNKNOWN} protest. A model `ollama ps` shows loaded
 * is refused {@link OLLAMA_IN_USE}. Every hook first asks the server over
 * HTTP, because the `ollama` CLI starts the app on macOS and Windows when it
 * is down; a server that does not answer, or an `OLLAMA_HOST` on another
 * machine or that cannot be read, leaves the plugin out with that as
 * `detect`'s note.
 *
 * Settings: `plugins.ollama.idleHours` (default {@link DEFAULT_IDLE_HOURS}).
 *
 * It uses the kit alone, as a plugin outside host-cleaner would.
 */

import { z } from 'zod'

import {
  failureReason,
  hoursText,
  idleHoursOr,
  idleHoursSetting,
  pluginKit,
  type Kit,
  type KitOptions,
} from './kit.ts'
import {
  PLUGIN_API,
  definePlugin,
  type Candidate,
  type Ctx,
  type Objection,
  type Plugin,
} from './types.ts'

export const OLLAMA_PLUGIN = 'ollama'

/** The kind, and so the id prefix, of every candidate this plugin proposes. */
export const OLLAMA_MODEL = 'ollama-model'

/** The refusal of a model `ollama ps` shows loaded. */
export const OLLAMA_IN_USE = 'ollama-in-use'

/** The protest on every model: ollama records when it was pulled, not when it was last run. */
export const OLLAMA_USE_UNKNOWN = 'ollama-use-unknown'

/** The refusal of every model when `ollama ps` fails, so a loaded one cannot be told apart. */
export const OLLAMA_PS_FAILED = 'ollama-ps-failed'

const USE_UNKNOWN_REASON = 'ollama records when a model was pulled, not when it was last run'

/** How long the server has to answer before it counts as down. */
const PING_MS = 5_000

/**
 * The time limit of one `ollama` command, so a hook's ping and command end
 * inside the core's 30 s hook limit and fail with ollama's own reason.
 */
const ASK_MS = 20_000

export interface OllamaOptions extends KitOptions {
  /** Idle hours before a model is a candidate (default {@link DEFAULT_IDLE_HOURS}); 0 makes every model one. */
  idleHours?: number | undefined
}

/** One row of `ollama list`. */
export interface OllamaModel {
  /** As `ollama rm` takes it, such as `llama3.2:latest`. */
  name: string
  /** The first 12 hex digits of its manifest's digest. */
  id: string
  /** The SIZE column as printed: `-` for a cloud model, which has nothing on disk. */
  size: string
  /** Bytes, from the SIZE column; null when it cannot be read. */
  bytes: number | null
  /** The MODIFIED column as printed, such as `4 days ago`. */
  modified: string
}

/** One row of `ollama ps`. */
export interface LoadedModel {
  name: string
  id: string
}

/**
 * The column starts and the rows of an `ollama` table, each row with its
 * leading NAME and ID; rows without both are dropped. Throws when the header
 * lacks a column in `need`.
 */
function table(
  stdout: string,
  need: readonly string[],
): { at: Map<string, number>; rows: (LoadedModel & { row: string })[] } {
  const lines = stdout.split('\n').filter((l) => l.trim() !== '')
  const header = lines[0] ?? ''
  const at = new Map<string, number>()
  for (const m of header.matchAll(/\S+/g)) at.set(m[0], m.index)
  const missing = need.filter((col) => !at.has(col))
  if (missing.length > 0) {
    throw new Error(`ollama printed a table without ${missing.join(', ')}: ${header.trim()}`)
  }
  const rows = lines.slice(1).flatMap((row) => {
    const [name, id] = row.trim().split(/\s+/)
    return name === undefined || id === undefined ? [] : [{ name, id, row }]
  })
  return { at, rows }
}

const UNITS: Record<string, number> = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 }

/** Bytes for SIZE text such as `3.9 GB` (ollama's units are powers of 1000); null for anything else. */
export function parseBytes(text: string): number | null {
  const m = /^(\d+(?:\.\d+)?) ([KMGT]?B)$/.exec(text.trim())
  return m === null ? null : Math.round(Number(m[1]) * UNITS[m[2]!]!)
}

/** The models in `ollama list`'s output. Throws when it is not the table ollama prints. */
export function parseList(stdout: string): OllamaModel[] {
  const { at, rows } = table(stdout, ['NAME', 'ID', 'SIZE', 'MODIFIED'])
  const size = at.get('SIZE')!
  const modified = at.get('MODIFIED')!
  return rows.map(({ name, id, row }) => {
    const sizeText = row.slice(size, modified).trim()
    return {
      name,
      id,
      size: sizeText,
      bytes: parseBytes(sizeText),
      modified: row.slice(modified).trim(),
    }
  })
}

/** The models in `ollama ps`'s output. Throws when it is not the table ollama prints. */
export function parsePs(stdout: string): LoadedModel[] {
  return table(stdout, ['NAME', 'ID']).rows.map(({ name, id }) => ({ name, id }))
}

/**
 * The fewest hours MODIFIED text can mean, by how ollama's `HumanTime` writes
 * it; null for `Never`, a time in the future, or text it does not write. Hours
 * are rounded before days, weeks and months are counted from them, so each of
 * those starts half an hour early.
 */
export function leastHours(text: string): number | null {
  const t = text.trim().toLowerCase()
  if (t === 'less than a second ago') return 0
  if (t === 'about a minute ago') return 1 / 60
  if (t === 'about an hour ago') return 1
  const m = /^(\d+) (second|minute|hour|day|week|month|year)s? ago$/.exec(t)
  if (m === null) return null
  const unit = m[2]!
  return (Number(m[1]) * UNIT_SECONDS[unit]!) / 3600 - (ROUNDED_HOURS.has(unit) ? 0.5 : 0)
}

const UNIT_SECONDS: Record<string, number> = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86_400,
  week: 604_800,
  month: 2_592_000,
  year: 31_536_000,
}

/** The units `HumanTime` counts from rounded hours. */
const ROUNDED_HOURS = new Set(['hour', 'day', 'week', 'month'])

/**
 * The server the `ollama` CLI talks to, read from `OLLAMA_HOST` as ollama
 * reads it: no scheme means `http` and port 11434, no host means 127.0.0.1,
 * and a bare IPv6 address is a host with no port. Null when it cannot be
 * read, since the CLI may still reach some server by it.
 */
export function serverUrl(host: string | undefined): URL | null {
  let s = (host ?? '').trim().replace(/^["']+|["']+$/g, '')
  const schemed = s.includes('://')
  if (!schemed) {
    if (/^[\da-f]*:[\da-f]*:[\da-f:.]*$/i.test(s)) s = `[${s}]`
    s = `http://${s === '' || s.startsWith(':') ? `127.0.0.1${s}` : s}`
  }
  const parse = (text: string): URL | null => {
    try {
      return new URL(text)
    } catch {
      return null
    }
  }
  // ollama takes a port it cannot read, or one out of range, as its default port.
  const u = parse(s) ?? parse(s.replace(/^(\w[\w+.-]*:\/\/(?:\[[^\]]*\]|[^/:[\]]*)):[^/]*/, '$1'))
  if (u === null) return null
  if (!schemed && u.port === '') u.port = '11434'
  return u
}

/** Whether `server` is this machine, so the models it lists are on this disk. */
export function isLocal(server: URL): boolean {
  const h = server.hostname
  return ['localhost', '0.0.0.0', '[::]', '[::1]'].includes(h) || /^127(\.\d+){3}$/.test(h)
}

/**
 * The address to ping `server` at. An unspecified address, which ollama's Go
 * client dials as this machine, becomes the loopback one, since Node's fetch
 * does not dial it everywhere.
 */
export function pingUrl(server: URL): string {
  const u = new URL(server.href)
  if (u.hostname === '0.0.0.0') u.hostname = '127.0.0.1'
  else if (u.hostname === '[::]') u.hostname = '[::1]'
  return `${u.origin}${u.pathname.replace(/\/$/, '')}/api/version`
}

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/** The `ollama` plugin on `kit`, or on a kit built from `opts`: models not pulled or changed for `idleHours`. */
export function ollamaPlugin(
  opts: OllamaOptions = {},
  kit: Kit = pluginKit(OLLAMA_PLUGIN, opts),
): Plugin {
  const threshold = idleHoursOr(opts.idleHours)
  const host = (opts.env ?? process.env)['OLLAMA_HOST']
  const server = serverUrl(host)

  /** Throws unless the server is on this machine and answers. Call it before any `ollama` command; the module doc says why. */
  const reach = async (ctx: Ctx): Promise<void> => {
    if (server === null) {
      throw new Error(`OLLAMA_HOST is "${host}", which names no server it can read`)
    }
    if (!isLocal(server)) {
      throw new Error(
        `OLLAMA_HOST points at ${server.host}, not this machine, so its models are not on this disk`,
      )
    }
    const url = pingUrl(server)
    const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(PING_MS)])
    const up = await fetch(url, { signal }).then(
      (r) => {
        // An unread body keeps the connection busy.
        r.body?.cancel().catch(() => {})
        return r.ok
      },
      () => false,
    )
    if (!up) throw new Error(`ollama's server at ${server.host} does not answer`)
  }

  /** The output of `ollama <args>`; throws with ollama's own message when it fails. */
  const ask = async (args: readonly string[], ctx: Ctx): Promise<string> => {
    const r = await kit.run(['ollama', ...args], { signal: ctx.signal, timeoutMs: ASK_MS })
    if (!r.ok) throw new Error(`ollama ${args.join(' ')} failed: ${failureReason(r)}`)
    return r.stdout
  }

  /** The models `ollama ps` shows loaded, once the server answers. */
  const loadedNow = async (ctx: Ctx): Promise<LoadedModel[]> => {
    await reach(ctx)
    return parsePs(await ask(['ps'], ctx))
  }

  const loadedAs = (m: LoadedModel, loaded: readonly LoadedModel[]) =>
    loaded.find((l) => l.name === m.name || l.id === m.id)

  const own = (c: Candidate): boolean => c.owner === OLLAMA_PLUGIN && c.kind === OLLAMA_MODEL

  return {
    name: OLLAMA_PLUGIN,
    async detect(ctx) {
      if (!kit.onPath('ollama')) return false
      try {
        await reach(ctx)
      } catch (err) {
        return { active: false, note: errorText(err) }
      }
      return true
    },
    async discover(ctx) {
      await reach(ctx)
      // A cloud model has no files here: deleting it frees nothing.
      const models = parseList(await ask(['list'], ctx)).filter((m) => m.size !== '-')
      return models.map((m) => {
        const hours = leastHours(m.modified)
        // Tags with one ID share their files, so removing one alone frees nothing.
        const sharers = models.filter((o) => o.id === m.id && o !== m).map((o) => o.name)
        const shared = sharers.length > 0
        const why = [
          hours === null
            ? `ollama list shows it modified "${m.modified}", which gives no age`
            : `not pulled or changed for at least ${hoursText(hours)} hours, by ollama list (threshold ${threshold})`,
          ...(m.bytes === null ? [`its size "${m.size}" cannot be read`] : []),
          ...(shared
            ? [
                `it shares its files (${m.size}) with ${sharers.join(', ')}, so removing it alone frees nothing`,
              ]
            : []),
        ]
        const old = hours !== null && hours >= threshold && m.bytes !== null
        return kit.candidate({
          kind: OLLAMA_MODEL,
          ref: m.name,
          name: m.name,
          ...(m.bytes === null ? {} : { bytes: shared ? 0 : m.bytes }),
          why: why.join('; '),
          costDescription: 're-download',
          ...(old ? {} : { held: true }),
          // The MODIFIED text moves with the clock, so it stays out.
          evidence: { kind: OLLAMA_MODEL, name: m.name, id: m.id },
        })
      })
    },
    async object(all, ctx) {
      const mine = all.filter(own)
      if (mine.length === 0) return []
      const objection = (
        c: Candidate,
        level: Objection['level'],
        code: string,
        reason: string,
      ): Objection => ({ by: OLLAMA_PLUGIN, candidate: c.id, level, code, reason })
      let loaded: LoadedModel[]
      try {
        loaded = await loadedNow(ctx)
      } catch (err) {
        // Without `ollama ps` a loaded model cannot be told apart, so every model is refused.
        return mine.map((c) => objection(c, 'refuse', OLLAMA_PS_FAILED, errorText(err)))
      }
      return mine.map((c) => {
        const l = loadedAs(c.evidence as { name: string; id: string }, loaded)
        return l === undefined
          ? objection(c, 'protest', OLLAMA_USE_UNKNOWN, USE_UNKNOWN_REASON)
          : objection(c, 'refuse', OLLAMA_IN_USE, `ollama ps shows ${l.name} loaded`)
      })
    },
    async delete(c, ctx) {
      if (c.ref === undefined || !own(c)) throw new Error(`${c.id} is not an ollama model`)
      const { id } = c.evidence as { id: string }
      await reach(ctx)
      const now = parseList(await ask(['list'], ctx)).find((m) => m.name === c.ref)
      if (now === undefined) return `already gone: ${c.ref}`
      if (now.id !== id) throw new Error(`${c.ref} is now ${now.id}, not ${id}`)
      // A run may have loaded it since the survey, and rm unloads a loaded model, so ps is read last.
      const l = loadedAs({ name: c.ref, id }, parsePs(await ask(['ps'], ctx)))
      if (l !== undefined) throw new Error(`ollama ps now shows ${l.name} loaded`)
      await ask(['rm', c.ref], ctx)
      let after: OllamaModel[]
      try {
        after = parseList(await ask(['list'], ctx))
      } catch (err) {
        // rm succeeded; only the check could not run, so the step is not a failure.
        return `ollama rm removed ${c.ref}; could not list again to check: ${errorText(err)}`
      }
      if (after.some((m) => m.name === c.ref)) {
        throw new Error(`ollama still lists ${c.ref} after ollama rm`)
      }
      return `ollama rm removed ${c.ref}`
    },
  }
}

/** The `ollama` plugin as the command line builds it. Settings: `idleHours`. */
export const ollamaDefinition = definePlugin({
  name: OLLAMA_PLUGIN,
  api: PLUGIN_API,
  settings: z.strictObject({ idleHours: idleHoursSetting }),
  create: ({ settings, env, kit }) => ollamaPlugin({ idleHours: settings.idleHours, env }, kit),
})
