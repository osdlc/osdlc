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
 * It uses the kit and the helpers the shipped plugins share, and nothing
 * private of the core.
 */

import { hostname, networkInterfaces } from 'node:os'

import { z } from 'zod'

import { errorText, failureReason, hoursText, objector } from './helpers.ts'
import { idleHoursOr, idleHoursSetting, pluginKit, type Kit, type KitOptions } from './kit.ts'
import { PLUGIN_API, definePlugin, type Candidate, type Ctx, type Plugin } from './types.ts'

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
 * The time limit of `ollama list` and `ollama ps`, below a hook's own with the
 * ping added: a stuck server then refuses ollama's models with its reason,
 * where an `object` past its limit would refuse every plugin's candidates.
 */
const READ_LIMIT_MS = 20_000

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
  /** The most bytes the SIZE column can mean ({@link sizeBound}); null when it cannot be read. */
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

/**
 * The most SIZE text such as `3.9 GB` can mean (ollama's units are powers of
 * 1000), as bytes and as text; null for anything else. ollama's `HumanBytes`
 * cuts a value of 10 or more to a whole number and rounds a smaller one to a
 * tenth unless it is whole, so `19 GB` can be up to 20 GB, `3.9 GB` up to
 * 3.95 GB, and `4 GB` and bytes are exact.
 */
export function sizeBound(text: string): { bytes: number; text: string } | null {
  const m = /^(\d+)(\.\d+)? ([KMGT]?B)$/.exec(text.trim())
  if (m === null) return null
  const unit = m[3]!
  const step = m[2] !== undefined ? 0.05 : unit !== 'B' && Number(m[1]) >= 10 ? 1 : 0
  const most = Number(m[1]! + (m[2] ?? '')) + step
  // Rounded to hundredths so float error does not print as 3.9499999.
  const shown = Math.round(most * 100) / 100
  return { bytes: Math.round(shown * UNITS[unit]!), text: `${shown} ${unit}` }
}

/** The most bytes SIZE text can mean; null for anything else. See {@link sizeBound}. */
export function parseBytes(text: string): number | null {
  return sizeBound(text)?.bytes ?? null
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
 * reads it (`envconfig.Host`): every quote around it stripped, no scheme
 * means `http` and port 11434, no host means 127.0.0.1, a bare IPv6 address
 * is a host with no port, and a port that is no number or out of range is the
 * default one. Null when it cannot be read, since the CLI may still reach
 * some server by it.
 */
export function serverUrl(host: string | undefined): URL | null {
  const text = (host ?? '')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim()
  const [, scheme, at, path] = /^(?:(.*?):\/\/)?([^/]*)(.*)$/s.exec(text)!
  // Node's URL reads these in a host as something other than the host.
  if (/[@?#%\\\s]/.test(at!)) return null
  // `host`, `[host]` or neither before a port; text that is not that has no port.
  const m = /^(?:\[([^[\]]*)\]|([^:[\]]*))(?::([^:[\]]*))?$/.exec(at!)
  const name = (m === null ? at! : (m[1] ?? m[2]!)) || '127.0.0.1'
  const port = m?.[3] ?? ''
  const given = /^[+-]?\d+$/.test(port) && Number(port) >= 0 && Number(port) <= 65_535
  const fallback = scheme === 'http' ? '80' : scheme === 'https' ? '443' : '11434'
  try {
    return new URL(
      `${scheme ?? 'http'}://${name.includes(':') ? `[${name}]` : name}:${given ? port : fallback}${path}`,
    )
  } catch {
    return null
  }
}

/** This machine's host name and the addresses of its network interfaces, lower case and without brackets or a zone. */
export function thisMachine(): string[] {
  const addresses = Object.values(networkInterfaces()).flatMap((list) =>
    (list ?? []).map((a) => a.address.replace(/%.*$/, '').toLowerCase()),
  )
  return [hostname().toLowerCase(), ...addresses]
}

/**
 * Whether `server` is this machine, so the models it lists are on this disk:
 * a loopback or unspecified address, an IPv4-mapped loopback one, or a name or
 * address in `names` ({@link thisMachine} by default).
 */
export function isLocal(server: URL, names: readonly string[] = thisMachine()): boolean {
  const h = server.hostname.toLowerCase()
  return (
    ['localhost', '0.0.0.0', '[::]', '[::1]'].includes(h) ||
    /^127(\.\d+){3}$/.test(h) ||
    // Node writes `[::ffff:127.0.0.1]` as `[::ffff:7f00:1]`.
    /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(h) ||
    names.includes(h.replace(/^\[(.*)\]$/, '$1'))
  )
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
      (err: unknown) => {
        // The hook was stopped, so the server's silence says nothing: keep why it was stopped.
        if (ctx.signal.aborted) throw ctx.signal.reason ?? err
        return false
      },
    )
    if (!up) throw new Error(`ollama's server at ${server.host} does not answer`)
  }

  /** The output of `ollama <args>`; throws with ollama's own message when it fails. */
  const ask = async (args: readonly string[], ctx: Ctx, timeoutMs?: number): Promise<string> => {
    const r = await kit.run(['ollama', ...args], { signal: ctx.signal, timeoutMs })
    if (!r.ok) throw new Error(`ollama ${args.join(' ')} failed: ${failureReason(r)}`)
    return r.stdout
  }

  const listed = async (ctx: Ctx): Promise<OllamaModel[]> =>
    parseList(await ask(['list'], ctx, READ_LIMIT_MS))

  const loadedNow = async (ctx: Ctx): Promise<LoadedModel[]> =>
    parsePs(await ask(['ps'], ctx, READ_LIMIT_MS))

  const loadedAs = (m: LoadedModel, loaded: readonly LoadedModel[]) =>
    loaded.find((l) => l.name === m.name || l.id === m.id)

  const own = (c: Candidate): boolean => c.owner === OLLAMA_PLUGIN && c.kind === OLLAMA_MODEL

  const objection = objector(OLLAMA_PLUGIN)

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
      const models = (await listed(ctx))
        .filter((m) => m.size !== '-')
        .map((m) => {
          const hours = leastHours(m.modified)
          // It may run by default: its age and size can be read, and it is at least as old as the threshold.
          const old = hours !== null && hours >= threshold && m.bytes !== null
          return { ...m, hours, old }
        })
      const byId = new Map<string, typeof models>()
      for (const m of models) {
        const tags = byId.get(m.id)
        if (tags === undefined) byId.set(m.id, [m])
        else tags.push(m)
      }
      return models.map((m) => {
        const { hours, old } = m
        // Tags with one ID share their files, freed only when all are removed:
        // counted once, on the first, when all may run by default, else not at all.
        const tags = byId.get(m.id)!
        const counted = tags.every((t) => t.old) ? tags[0] : undefined
        const others = tags.filter((o) => o !== m).map((o) => o.name)
        const why = [
          hours === null
            ? `ollama list shows it modified "${m.modified}", which gives no age`
            : `not pulled or changed for at least ${hoursText(hours)} hours, by ollama list (threshold ${threshold})`,
          ...(m.bytes === null ? [`its size "${m.size}" cannot be read`] : []),
          ...(others.length > 0
            ? [
                `it shares its files (${m.size}) with ${others.join(', ')}, so removing it alone frees nothing` +
                  (counted === undefined
                    ? ''
                    : `; removing them all frees what ${counted.name} counts`),
              ]
            : []),
        ]
        return kit.candidate({
          kind: OLLAMA_MODEL,
          ref: m.name,
          name: m.name,
          ...(m.bytes === null ? {} : { bytes: others.length > 0 && m !== counted ? 0 : m.bytes }),
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
      let loaded: LoadedModel[]
      try {
        await reach(ctx)
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
      const now = (await listed(ctx)).find((m) => m.name === c.ref)
      if (now === undefined) return `already gone: ${c.ref}`
      if (now.id !== id) throw new Error(`${c.ref} is now ${now.id}, not ${id}`)
      // A run may have loaded it since the survey, and rm unloads a loaded model, so ps is read last.
      const l = loadedAs({ name: c.ref, id }, await loadedNow(ctx))
      if (l !== undefined) throw new Error(`ollama ps now shows ${l.name} loaded`)
      await ask(['rm', c.ref], ctx)
      let after: OllamaModel[]
      try {
        after = await listed(ctx)
      } catch (err) {
        // rm succeeded; only the check could not run, so the step is not a failure.
        return `ollama rm removed ${c.ref}; could not list again to check: ${errorText(err)}`
      }
      if (after.some((m) => m.name === c.ref)) {
        throw new Error(`ollama still lists ${c.ref} after ollama rm`)
      }
      const sharers = after.filter((m) => m.id === id).map((m) => m.name)
      const freed =
        sharers.length > 0
          ? `freed nothing, its files stay for ${sharers.join(', ')}`
          : `freed at most ${sizeBound(now.size)?.text ?? now.size}`
      return `ollama rm removed ${c.ref}; ${freed}`
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
