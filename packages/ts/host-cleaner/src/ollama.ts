/**
 * The `ollama` plugin: models nobody has pulled or changed for a while.
 *
 * Detected when `ollama` is on PATH. Each model `ollama list` shows is an
 * `ollama-model:<name>` ref, deleted with `ollama rm`, and costs a
 * re-download. Its idle time is the MODIFIED column, which ollama writes as
 * rounded text ("4 days ago"), so the threshold is held against the least
 * time that text can mean. A model younger than the threshold, or whose time
 * cannot be read, is held for review. A model `ollama ps` shows loaded is
 * refused `in-use`. Ollama installed but not answering adds a warning and no
 * candidates. Settings: `plugins.ollama.idleHours` (default {@link DEFAULT_IDLE_HOURS}).
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
export const IN_USE = 'in-use'

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
  /** Bytes, from the SIZE column; null for a cloud model, which has nothing on disk. */
  bytes: number | null
  /** The MODIFIED column as printed, such as `4 days ago`. */
  modified: string
}

/** One row of `ollama ps`. */
export interface LoadedModel {
  name: string
  id: string
}

/** The header and rows of an `ollama` table; throws when the header lacks a column in `need`. */
function table(
  stdout: string,
  need: readonly string[],
): { at: Map<string, number>; rows: string[] } {
  const lines = stdout.split('\n').filter((l) => l.trim() !== '')
  const header = lines[0] ?? ''
  const at = new Map<string, number>()
  for (const m of header.matchAll(/\S+/g)) at.set(m[0], m.index)
  const missing = need.filter((col) => !at.has(col))
  if (missing.length > 0) {
    throw new Error(`ollama printed a table without ${missing.join(', ')}: ${header.trim()}`)
  }
  return { at, rows: lines.slice(1) }
}

/** The text of `row` under the column starting at `start`, up to the next column. */
const cell = (row: string, start: number, end: number | undefined): string =>
  row.slice(start, end).trim()

const UNITS: Record<string, number> = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 }

/** Bytes for SIZE text such as `3.9 GB` (ollama's units are powers of 1000); null for `-` or anything else. */
export function parseBytes(text: string): number | null {
  const m = /^(\d+(?:\.\d+)?) (B|KB|MB|GB|TB)$/.exec(text.trim())
  return m === null ? null : Math.round(Number(m[1]) * UNITS[m[2]!]!)
}

/** The models in `ollama list`'s output. Throws when it is not the table ollama prints. */
export function parseList(stdout: string): OllamaModel[] {
  const { at, rows } = table(stdout, ['NAME', 'ID', 'SIZE', 'MODIFIED'])
  const size = at.get('SIZE')!
  const modified = at.get('MODIFIED')!
  return rows.flatMap((row): OllamaModel[] => {
    const [name, id] = row.trim().split(/\s+/)
    if (name === undefined || id === undefined) return []
    return [
      {
        name,
        id,
        bytes: parseBytes(cell(row, size, modified)),
        modified: cell(row, modified, undefined),
      },
    ]
  })
}

/** The models in `ollama ps`'s output. Throws when it is not the table ollama prints. */
export function parsePs(stdout: string): LoadedModel[] {
  const { rows } = table(stdout, ['NAME', 'ID'])
  return rows.flatMap((row): LoadedModel[] => {
    const [name, id] = row.trim().split(/\s+/)
    return name === undefined || id === undefined ? [] : [{ name, id }]
  })
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
      return Math.max(1, n - 0.5)
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

/** `hours` for a sentence, in tenths rounded down, so it never says more than was read. */
const hoursText = (hours: number): string => String(Math.floor(hours * 10) / 10)

/** The `ollama` plugin on `kit`, or on a kit built from `opts`: models not pulled or changed for `idleHours`. */
export function ollamaPlugin(
  opts: OllamaOptions = {},
  kit: Kit = pluginKit(OLLAMA_PLUGIN, opts),
): Plugin {
  const idle = opts.idleHours
  const threshold =
    idle !== undefined && Number.isFinite(idle) && idle >= 0 ? idle : DEFAULT_IDLE_HOURS

  /** The output of `ollama <args>`; throws with ollama's own message when it fails. */
  const ask = async (args: readonly string[], ctx: Ctx): Promise<string> => {
    const r = await kit.run(['ollama', ...args], { signal: ctx.signal })
    if (!r.ok) {
      const why = r.stderr.trim() || r.error || `exit ${r.exitCode}`
      throw new Error(`ollama ${args.join(' ')} failed: ${why}`)
    }
    return r.stdout
  }

  const loadedAs = (m: Pick<OllamaModel, 'name' | 'id'>, loaded: readonly LoadedModel[]) =>
    loaded.find((l) => l.name === m.name || l.id === m.id)

  const own = (c: Candidate): boolean => c.owner === OLLAMA_PLUGIN && c.kind === OLLAMA_MODEL

  return {
    name: OLLAMA_PLUGIN,
    detect: () => kit.onPath('ollama'),
    async discover(ctx) {
      // A cloud model has no files here: deleting it frees nothing.
      return parseList(await ask(['list'], ctx))
        .filter((m) => m.bytes !== null)
        .map((m) => {
          const hours = leastHours(m.modified)
          const old = hours !== null && hours >= threshold
          return kit.candidate({
            kind: OLLAMA_MODEL,
            ref: m.name,
            name: m.name,
            bytes: m.bytes!,
            why:
              hours === null
                ? `ollama list shows it modified "${m.modified}", which gives no age`
                : `not pulled or changed for at least ${hoursText(hours)} hours, by ollama list (threshold ${threshold})`,
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
      const refuse = (c: Candidate, code: string, reason: string): Objection => ({
        by: OLLAMA_PLUGIN,
        candidate: c.id,
        level: 'refuse',
        code,
        reason,
      })
      let loaded: LoadedModel[]
      try {
        loaded = parsePs(await ask(['ps'], ctx))
      } catch (err) {
        // Whether any model is loaded cannot be told; none is taken meanwhile.
        const why = err instanceof Error ? err.message : String(err)
        return mine.map((c) => refuse(c, 'ollama-ps-failed', why))
      }
      return mine.flatMap((c) => {
        const { name, id } = c.evidence as { name: string; id: string }
        const l = loadedAs({ name, id }, loaded)
        return l === undefined ? [] : [refuse(c, IN_USE, `ollama ps shows ${l.name} loaded`)]
      })
    },
    async delete(c, ctx) {
      if (c.ref === undefined || !own(c)) throw new Error(`${c.id} is not an ollama model`)
      const { id } = c.evidence as { id: string }
      // A run may have loaded it since the survey.
      const l = loadedAs({ name: c.ref, id }, parsePs(await ask(['ps'], ctx)))
      if (l !== undefined) throw new Error(`ollama ps now shows ${l.name} loaded`)
      const now = parseList(await ask(['list'], ctx)).find((m) => m.name === c.ref)
      if (now === undefined) return `already gone: ${c.ref}`
      if (now.id !== id) throw new Error(`${c.ref} is now ${now.id}, not ${id}`)
      await kit.run(['ollama', 'rm', c.ref], { signal: ctx.signal, check: true })
      if (parseList(await ask(['list'], ctx)).some((m) => m.name === c.ref)) {
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
  create: ({ settings, kit }) => ollamaPlugin({ idleHours: settings.idleHours }, kit),
})
