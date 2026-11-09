/** Harness version spellings and how they order. */

export type Versioning = 'semver' | 'date' | 'unknown'

const ID = String.raw`(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)`
/** Semantic Versioning 2.0.0: no leading zeros in numbers, no empty identifiers. */
const SEMVER = new RegExp(
  String.raw`^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-${ID}(?:\.${ID})*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$`,
  'u',
)
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/u

/** Whether `v` is a real calendar date, spelled `YYYY-MM-DD`. */
export function isCalendarDate(v: string): boolean {
  const m = DATE.exec(v)
  if (m === null) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = new Date(Date.UTC(y, mo - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d
}

/** Whether `v` is spelled the way `versioning` says. `unknown` allows no version at all. */
export function validVersion(v: string, versioning: Versioning): boolean {
  if (versioning === 'semver') return SEMVER.test(v)
  if (versioning === 'date') return isCalendarDate(v)
  return false
}

/** Compare two digit strings by value without losing precision: -1, 0 or 1. */
function compareDigits(a: string, b: string): number {
  const x = /^\d+$/u.test(a) ? a.replace(/^0+(?=\d)/u, '') : '0'
  const y = /^\d+$/u.test(b) ? b.replace(/^0+(?=\d)/u, '') : '0'
  if (x.length !== y.length) return x.length < y.length ? -1 : 1
  return x < y ? -1 : x > y ? 1 : 0
}

/** Semver 2.0.0 precedence (build metadata ignored): -1, 0 or 1. Numbers of any size compare exactly. */
export function compareSemver(a: string, b: string): number {
  const split = (v: string): [string[], string[]] => {
    const [core = '', pre] = (v.split('+')[0] ?? '').split(/-(.*)/su, 2)
    return [core.split('.'), pre === undefined ? [] : pre.split('.')]
  }
  const [ca, pa] = split(a)
  const [cb, pb] = split(b)
  for (let i = 0; i < 3; i++) {
    const d = compareDigits(ca[i] ?? '0', cb[i] ?? '0')
    if (d !== 0) return d
  }
  if (pa.length === 0 || pb.length === 0) return Math.sign(pb.length - pa.length)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i]
    const y = pb[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (x === y) continue
    const nx = /^\d+$/u.test(x)
    const ny = /^\d+$/u.test(y)
    if (nx && ny) return compareDigits(x, y)
    if (nx) return -1
    if (ny) return 1
    return x < y ? -1 : 1
  }
  return 0
}

/** Order two versions of one harness. Dates compare as strings; `unknown` has no order. */
export function compareVersions(a: string, b: string, versioning: Versioning): number {
  if (versioning === 'semver') return compareSemver(a, b)
  return a < b ? -1 : a > b ? 1 : 0
}

/** A scope's version range: `since` inclusive, `until` exclusive, null for no limit. */
export interface VersionRange {
  since: string | null
  until: string | null
}

/** Whether `version` lies in `[since, until)`. */
export function inRange(version: string, r: VersionRange, versioning: Versioning): boolean {
  if (r.since !== null && compareVersions(version, r.since, versioning) < 0) return false
  if (r.until !== null && compareVersions(version, r.until, versioning) >= 0) return false
  return true
}

/** Whether two ranges share a version. */
export function overlaps(a: VersionRange, b: VersionRange, versioning: Versioning): boolean {
  const before = (x: string | null, y: string | null): boolean =>
    x === null || y === null || compareVersions(x, y, versioning) < 0
  return before(a.since, b.until) && before(b.since, a.until)
}

/** Order scopes of one harness and subject: by `since` (no limit first), then by model. */
export function compareScopes(
  a: { since: string | null; model?: string | null },
  b: { since: string | null; model?: string | null },
  versioning: Versioning,
): number {
  if (a.since !== b.since) {
    if (a.since === null) return -1
    if (b.since === null) return 1
    return versioning === 'unknown' ? 0 : compareVersions(a.since, b.since, versioning)
  }
  const x = a.model ?? ''
  const y = b.model ?? ''
  return x < y ? -1 : x > y ? 1 : 0
}
