/**
 * The `ollama` plugin: models nobody has pulled or changed for a while.
 *
 * Detected when `ollama` is on PATH. Each model `ollama list` shows is an
 * `ollama-model:<name>` ref, deleted with `ollama rm`, and costs a
 * re-download. Its idle time is the MODIFIED column, which ollama writes as
 * rounded text ("4 days ago"), so the threshold is held against the least
 * time that text can mean. A model younger than the threshold, or whose time
 * or size cannot be read, is held for review. That time is when it was
 * pulled, not when it was last run, so every model also gets an
 * {@link OLLAMA_USE_UNKNOWN} protest. A model `ollama ps` shows loaded is
 * refused {@link OLLAMA_IN_USE}. Every hook first asks the server over HTTP,
 * because the `ollama` CLI starts the app on macOS and Windows when it is
 * down; a server that does not answer, or an `OLLAMA_HOST` on another
 * machine, adds a warning and no candidates. Settings:
 * `plugins.ollama.idleHours` (default {@link DEFAULT_IDLE_HOURS}).
 *
 * It uses the kit alone, as a plugin outside host-cleaner would.
 */

import { z } from 'zod'

import {
  DEFAULT_IDLE_HOURS,
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

const USE_UNKNOWN_REASON = 'ollama records when a model was pulled, not when it was last run'

/** How long the server has to answer before it counts as down. */
const PING_MS = 5_000

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
  const n = Number(m[1])
  switch (m[2]) {
    case 'second':
      return n / 3600
    case 'minute':
      return n / 60
    case 'hour':
      return n - 0.5
    case 'day':
      return 24 * n - 0.5
    case 'week':
      return 168 * n - 0.5
    case 'month':
      return 720 * n - 0.5
    default:
      return 8760 * n
  }
}

/**
 * The server the `ollama` CLI talks to, read from `OLLAMA_HOST` as ollama
 * reads it: no scheme means `http` and port 11434, no host means 127.0.0.1.
 */
export function serverUrl(host: string | undefined): URL {
  let s = (host ?? '').trim().replace(/^["']|["']$/g, '')
  const schemed = s.includes('://')
  if (!schemed) s = `http://${s === '' || s.startsWith(':') ? `127.0.0.1${s}` : s}`
  let u: URL
  try {
    u = new URL(s)
  } catch {
    u = new URL('http://127.0.0.1')
  }
  if (!schemed && u.port === '') u.port = '11434'
  return u
}

/** Whether `server` is this machine, so the models it lists are on this disk. */
export function isLocal(server: URL): boolean {
  const h = server.hostname
  return ['localhost', '0.0.0.0', '[::]', '[::1]'].includes(h) || /^127(\.\d+){3}$/.test(h)
}

/** A copy of `hoursText` in artifacts.ts, which this plugin does not import because it uses the kit alone. */
const hoursText = (hours: number): string => String(Math.floor(hours * 10) / 10)

/** The `ollama` plugin on `kit`, or on a kit built from `opts`: models not pulled or changed for `idleHours`. */
export function ollamaPlugin(
  opts: OllamaOptions = {},
  kit: Kit = pluginKit(OLLAMA_PLUGIN, opts),
): Plugin {
  const idle = opts.idleHours
  const threshold =
    idle !== undefined && Number.isFinite(idle) && idle >= 0 ? idle : DEFAULT_IDLE_HOURS
  const server = serverUrl((opts.env ?? process.env)['OLLAMA_HOST'])

  /** Throws unless the server is on this machine and answers. Call it before any `ollama` command; the module doc says why. */
  const reach = async (ctx: Ctx): Promise<void> => {
    if (!isLocal(server)) {
      throw new Error(
        `OLLAMA_HOST points at ${server.host}, not this machine, so its models are not on this disk`,
      )
    }
    const url = `${server.origin}${server.pathname.replace(/\/$/, '')}/api/version`
    const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(PING_MS)])
    const up = await fetch(url, { signal }).then(
      (r) => r.ok,
      () => false,
    )
    if (!up) throw new Error(`ollama's server at ${server.host} does not answer`)
  }

  /** The output of `ollama <args>`; throws with ollama's own message when it fails. */
  const ask = async (args: readonly string[], ctx: Ctx): Promise<string> => {
    const r = await kit.run(['ollama', ...args], { signal: ctx.signal })
    if (!r.ok) {
      const why = r.stderr.trim() || r.error || `exit ${r.exitCode}`
      throw new Error(`ollama ${args.join(' ')} failed: ${why}`)
    }
    return r.stdout
  }

  const loadedAs = (m: LoadedModel, loaded: readonly LoadedModel[]) =>
    loaded.find((l) => l.name === m.name || l.id === m.id)

  const own = (c: Candidate): boolean => c.owner === OLLAMA_PLUGIN && c.kind === OLLAMA_MODEL

  return {
    name: OLLAMA_PLUGIN,
    detect: () => kit.onPath('ollama'),
    async discover(ctx) {
      await reach(ctx)
      // Tags with one ID share their files, so only the first carries the size.
      const firstOfId = new Map<string, string>()
      return parseList(await ask(['list'], ctx)).flatMap((m) => {
        // A cloud model has no files here: deleting it frees nothing.
        if (m.size === '-') return []
        const hours = leastHours(m.modified)
        const sharer = firstOfId.get(m.id)
        if (sharer === undefined) firstOfId.set(m.id, m.name)
        const why = [
          hours === null
            ? `ollama list shows it modified "${m.modified}", which gives no age`
            : `not pulled or changed for at least ${hoursText(hours)} hours, by ollama list (threshold ${threshold})`,
          ...(m.bytes === null ? [`its size "${m.size}" cannot be read`] : []),
          ...(sharer === undefined ? [] : [`it shares its files with ${sharer}`]),
        ]
        const old = hours !== null && hours >= threshold && m.bytes !== null
        return [
          kit.candidate({
            kind: OLLAMA_MODEL,
            ref: m.name,
            name: m.name,
            ...(m.bytes === null ? {} : { bytes: sharer === undefined ? m.bytes : 0 }),
            why: why.join('; '),
            costDescription: 're-download',
            ...(old ? {} : { held: true }),
            // The MODIFIED text moves with the clock, so it stays out.
            evidence: { kind: OLLAMA_MODEL, name: m.name, id: m.id },
          }),
        ]
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
        await reach(ctx)
        loaded = parsePs(await ask(['ps'], ctx))
      } catch (err) {
        // Without `ollama ps` a loaded model cannot be told apart, so every model is refused.
        const why = err instanceof Error ? err.message : String(err)
        return mine.map((c) => objection(c, 'refuse', 'ollama-ps-failed', why))
      }
      return mine.map((c) => {
        const l = loadedAs(c.evidence as LoadedModel, loaded)
        return l === undefined
          ? objection(c, 'protest', OLLAMA_USE_UNKNOWN, USE_UNKNOWN_REASON)
          : objection(c, 'refuse', OLLAMA_IN_USE, `ollama ps shows ${l.name} loaded`)
      })
    },
    async delete(c, ctx) {
      if (c.ref === undefined || !own(c)) throw new Error(`${c.id} is not an ollama model`)
      const { id } = c.evidence as { id: string }
      await reach(ctx)
      // A run may have loaded it since the survey.
      const l = loadedAs({ name: c.ref, id }, parsePs(await ask(['ps'], ctx)))
      if (l !== undefined) throw new Error(`ollama ps now shows ${l.name} loaded`)
      const now = parseList(await ask(['list'], ctx)).find((m) => m.name === c.ref)
      if (now === undefined) return `already gone: ${c.ref}`
      if (now.id !== id) throw new Error(`${c.ref} is now ${now.id}, not ${id}`)
      await ask(['rm', c.ref], ctx)
      let after: OllamaModel[]
      try {
        after = parseList(await ask(['list'], ctx))
      } catch (err) {
        // rm succeeded; only the check could not run, so the step is not a failure.
        const why = err instanceof Error ? err.message : String(err)
        return `ollama rm removed ${c.ref}; could not list again to check: ${why}`
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
