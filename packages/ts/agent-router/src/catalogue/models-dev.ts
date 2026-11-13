// models.dev rows as catalogue model rows: the one mapper the snapshot release
// step and a machine-catalogue refresh share. Pure: the caller fetches `api.json`.
import { isEffortLevel } from '../ref.ts'
import { NATIVE_NAME_PATTERN } from './schema.ts'
import type { ModelRow, ProviderRow } from './types.ts'

/** Where models.dev publishes its catalogue. */
export const MODELS_DEV_URL = 'https://models.dev/api.json'

/** The fields of a models.dev model the mapper reads. */
export type ModelsDevModel = {
  id: string
  family?: string
  release_date?: string
  status?: string
  tool_call?: boolean
  reasoning?: boolean
  reasoning_options?: { type?: string; values?: string[] }[]
  modalities?: { input?: string[]; output?: string[] }
  limit?: { context?: number }
  cost?: { input?: number; output?: number }
}

/** models.dev's `api.json`: provider id to its models. */
export type ModelsDevApi = Record<string, { models?: Record<string, ModelsDevModel> }>

/** Local runtimes get no models.dev rows: what they hold is per machine. */
const LOCAL_KINDS = new Set(['ollama', 'lmstudio'])
const LONG_CONTEXT = 1_000_000
/** Why a row whose fields are not the types models.dev documents is refused. */
const MALFORMED = 'row is malformed'
const DATED = /^(.+)-(\d{8})$/
const ISO_DAY = /^(\d{4}-\d{2}-\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/

/** The calendar day of an ISO date or date-time (`2026-10-08`), or null when it is neither. */
function releaseDay(value: string): string | null {
  const day = ISO_DAY.exec(value)?.[1]
  if (day === undefined) return null
  const parsed = new Date(`${day}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(day) ? day : null
}

/**
 * Why `m` may not become a row, or null. A release date decides which model
 * heads a tier, so it must be a real ISO date no later than `today`; the id is
 * handed to a CLI, so it must match {@link NATIVE_NAME_PATTERN}.
 */
function rowProblem(m: ModelsDevModel, today: string): string | null {
  if (typeof m.id !== 'string' || !NATIVE_NAME_PATTERN.test(m.id))
    return 'id is not a plain model name'
  if (m.release_date === undefined) return null
  const day = typeof m.release_date === 'string' ? releaseDay(m.release_date) : null
  if (day === null) return 'release_date is not an ISO date'
  if (day > today) return 'release_date is in the future'
  return null
}

function isEmbedding(m: ModelsDevModel): boolean {
  return /embedding/.test(m.id) || /embedding/.test(m.family ?? '')
}

function hasModality(list: readonly string[] | undefined, modality: string): boolean {
  return list?.includes(modality) === true
}

/**
 * Kept: models that output text only (with or without tool calling, or embeddings) and models
 * whose output includes images. A model with text and image output is kept; one mixing text with
 * audio or video, and audio- or video-only ones, are dropped. Non-tool text models stay,
 * reachable by pin or exact name, never by a wildcard.
 */
function kept(m: ModelsDevModel): boolean {
  const out = m.modalities?.output ?? ['text']
  return hasModality(out, 'image') || (out.length === 1 && out[0] === 'text')
}

/**
 * One models.dev model as a catalogue row. The release date is kept as its
 * calendar day, and left out when it is not an ISO date. Efforts come from the `effort`
 * entry of `reasoning_options`, keeping only words on agent-call's `EFFORT_LEVELS`
 * (the catalogue schema refuses any other, and no reference could name it). With
 * no `effort` entry, a `budget_tokens`-only one, or no word on the scale, the row
 * takes `prior`'s efforts, or leaves them out for a lower layer to supply. Aliases
 * come from `prior`: models.dev has none.
 */
export function modelsDevRow(m: ModelsDevModel, prior?: ModelRow): ModelRow {
  const row: ModelRow = {}
  if (m.family !== undefined) row.family = m.family
  const day = m.release_date === undefined ? null : releaseDay(m.release_date)
  if (day !== null) row.release_date = day
  if (m.limit?.context !== undefined && m.limit.context > 0) row.context = { max: m.limit.context }
  const efforts = m.reasoning_options
    ?.find((o) => o.type === 'effort')
    ?.values?.filter((e) => isEffortLevel(e))
  if (efforts !== undefined && efforts.length > 0) row.efforts = efforts
  else if (prior?.efforts !== undefined) row.efforts = [...prior.efforts]
  if (m.cost?.input !== undefined && m.cost.output !== undefined) {
    row.cost = { input: m.cost.input, output: m.cost.output }
  }
  const traits: NonNullable<ModelRow['traits']> = []
  if (isEmbedding(m)) traits.push('embedding')
  else if (m.tool_call === true) traits.push('agent')
  if (m.reasoning === true) traits.push('reasoning')
  if (hasModality(m.modalities?.input, 'image')) traits.push('vision')
  if (hasModality(m.modalities?.output, 'image')) traits.push('image-out')
  if ((m.limit?.context ?? 0) >= LONG_CONTEXT) traits.push('long-context')
  if (traits.length > 0) row.traits = traits
  row.status = m.status === 'deprecated' ? 'deprecated' : 'current'
  if (prior?.aliases !== undefined) row.aliases = [...prior.aliases]
  return row
}

/**
 * The result of {@link modelsDevRows}: the mapped model rows, the models.dev providers it did not
 * know, and the rows it refused.
 */
export type ModelsDevRows = {
  /** Keyed `provider/id`, sorted. */
  models: Record<string, ModelRow>
  /** models.dev providers the catalogue does not know, dropped, sorted. */
  unknownProviders: string[]
  /** Kept models refused as rows (`rowProblem`), keyed `provider/id`, sorted by key. */
  rejected: { key: string; reason: string }[]
}

/**
 * The model rows of every provider in `providers` that models.dev lists, local
 * runtimes excepted. Only kept models (`kept`), and of those only the ones
 * with a plain id and, when it has one, a release date that is an ISO date no
 * later than `today` (`YYYY-MM-DD`, default the current UTC day); the rest, and any row
 * too malformed to map, are `rejected`. A dated id (`claude-haiku-4-5-20251001`) whose undated base is a
 * row becomes an alias of the base. `prior` (keyed `provider/id`) supplies
 * what models.dev lacks, per {@link modelsDevRow}.
 */
export function modelsDevRows(
  api: ModelsDevApi,
  providers: Readonly<Record<string, ProviderRow>>,
  prior: Readonly<Record<string, ModelRow>> = {},
  today: string = new Date().toISOString().slice(0, 10),
): ModelsDevRows {
  const models: Record<string, ModelRow> = {}
  const rejected: ModelsDevRows['rejected'] = []
  for (const [provider, facts] of Object.entries(providers)) {
    if (LOCAL_KINDS.has(facts.kind ?? '')) continue
    const reject = (m: ModelsDevModel | null, reason: string) =>
      rejected.push({ key: `${provider}/${String(m?.id)}`, reason })
    const listed = Object.values(api[provider]?.models ?? {}).filter((m) => {
      let reason: string | null
      try {
        if (!kept(m)) return false
        reason = rowProblem(m, today)
      } catch {
        reason = MALFORMED
      }
      if (reason !== null) reject(m, reason)
      return reason === null
    })
    const ids = new Set(listed.map((m) => m.id))
    const dated: [string, string][] = []
    for (const m of listed) {
      const base = DATED.exec(m.id)?.[1]
      if (base !== undefined && ids.has(base)) {
        dated.push([base, m.id])
        continue
      }
      const key = `${provider}/${m.id}`
      try {
        models[key] = modelsDevRow(m, Object.hasOwn(prior, key) ? prior[key] : undefined)
      } catch {
        reject(m, MALFORMED)
      }
    }
    for (const [base, id] of dated) {
      const row = models[`${provider}/${base}`]
      if (row === undefined) continue
      row.aliases = [...new Set([...(row.aliases ?? []), id])].sort()
    }
  }
  const sorted: Record<string, ModelRow> = {}
  for (const key of Object.keys(models).sort()) sorted[key] = models[key]!
  const unknownProviders = Object.keys(api)
    .filter((p) => !Object.hasOwn(providers, p))
    .sort()
  rejected.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  return { models: sorted, unknownProviders, rejected }
}
