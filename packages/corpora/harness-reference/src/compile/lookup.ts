/**
 * `lookup`: the value a harness has for a subject, from a compiled `harness-knowledge.json`.
 */
import { inRange, validVersion } from '../beta/versions.ts'
import type { Knowledge, KnowledgeValue, Strength } from './knowledge.ts'

export interface LookupQuery {
  /** The harness version, in the harness's own spelling. Without it, the open-ended value wins. */
  version?: string
  platform?: string
  model?: string
  /** Weak and disputed values are left out unless accepted. */
  accept?: { weak?: boolean; disputed?: boolean }
}

export interface Found {
  value: unknown
  strength: Strength
  basis: string
  disputed: boolean
}

/** Two values fit the query equally well, so the file cannot say which one to use. */
export class AmbiguousValue extends Error {
  readonly candidates: readonly KnowledgeValue[]
  constructor(harness: string, subject: string, candidates: readonly KnowledgeValue[]) {
    super(
      `${harness} ${subject}: ${candidates.length} values fit equally well: ${candidates.map((c) => c.basis).join(', ')}`,
    )
    this.name = 'AmbiguousValue'
    this.candidates = candidates
  }
}

/** How narrow a scope is: a platform list and a model each count one. */
const specificity = (v: KnowledgeValue): number =>
  (v.scope.platform.length > 0 ? 1 : 0) + (v.scope.model !== null ? 1 : 0)

/**
 * The value for `harness` and `subject` that fits `query`, or undefined.
 *
 * - Version: `since` is inclusive and `until` exclusive. Semver compares by precedence, dates as
 *   strings. With no version, only values with `until: null` count. A value with no version limit
 *   fits every version.
 * - A version query is checked against the harness's versioning and throws when malformed. For a
 *   harness with `unknown` versioning the version is ignored.
 * - Platform and model: an empty platform list or a null model fits any query. A listed platform
 *   or a model fits only when the query names it. A value that is narrow on a dimension the query
 *   leaves out loses to one that is broad on it; candidates are ranked by how many omitted
 *   dimensions they narrow first, then by how narrow the supplied dimensions are.
 * - Among those, the narrowest scope wins. Two equally narrow candidates throw {@link AmbiguousValue}; a
 *   disputed one loses to an undisputed one.
 * - Weak and disputed values are skipped unless `query.accept` allows them.
 */
export function lookup(
  knowledge: Knowledge,
  harness: string,
  subject: string,
  query: LookupQuery = {},
): Found | undefined {
  const versioning = knowledge.harnesses[harness]?.versioning ?? 'unknown'
  if (
    query.version !== undefined &&
    versioning !== 'unknown' &&
    !validVersion(query.version, versioning)
  )
    throw new Error(`${harness}: "${query.version}" is not a ${versioning} version`)
  let candidates = knowledge.values.filter((v) => {
    if (v.harness !== harness || v.subject !== subject) return false
    if (v.strength === 'weak' && query.accept?.weak !== true) return false
    if (v.disputed === true && query.accept?.disputed !== true) return false
    if (query.version === undefined) return v.scope.until === null
    if (versioning === 'unknown') return true
    return inRange(query.version, v.scope, versioning)
  })

  const fits = (v: KnowledgeValue): boolean =>
    (v.scope.platform.length === 0 ||
      query.platform === undefined ||
      v.scope.platform.includes(query.platform)) &&
    (v.scope.model === null || query.model === undefined || v.scope.model === query.model)
  const narrowOnOmitted = (v: KnowledgeValue): number =>
    (query.platform === undefined && v.scope.platform.length > 0 ? 1 : 0) +
    (query.model === undefined && v.scope.model !== null ? 1 : 0)
  candidates = candidates.filter(fits)
  if (candidates.length === 0) return undefined
  const fewest = Math.min(...candidates.map(narrowOnOmitted))
  candidates = candidates.filter((v) => narrowOnOmitted(v) === fewest)

  const best = Math.max(...candidates.map(specificity))
  let top = candidates.filter((v) => specificity(v) === best)
  if (top.some((v) => v.disputed !== true)) top = top.filter((v) => v.disputed !== true)
  if (top.length > 1) throw new AmbiguousValue(harness, subject, top)
  const v = top[0] as KnowledgeValue
  return { value: v.value, strength: v.strength, basis: v.basis, disputed: v.disputed === true }
}
