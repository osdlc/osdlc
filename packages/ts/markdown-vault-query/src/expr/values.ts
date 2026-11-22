/**
 * Runtime value model for the Bases expression language.
 *
 * Primitives (string/number/boolean/null), lists, and plain objects use JS
 * natives; the Bases-specific types (date, duration, link, file, regexp, and
 * the render-only html/image/icon) are classes. Evaluation errors are values
 * (ErrorValue), matching Obsidian's per-cell error model.
 */

import type { VaultNote } from '@osdlc/markdown-vault'

/** A date, or a date and time. `hasTime` is false for a date-only value such as `2026-01-31`. */
export class DateValue {
  /** The instant, in local time for a date-only value. */
  date: Date
  /** False when the value was written as a date with no time of day. */
  hasTime: boolean

  constructor(date: Date, hasTime: boolean) {
    this.date = date
    this.hasTime = hasTime
  }

  /** The instant in milliseconds since the epoch. */
  get ms(): number {
    return this.date.getTime()
  }
}

/**
 * Calendar-aware duration: months are applied calendar-wise in date
 * arithmetic; in numeric contexts a month counts as 30 days and a year as
 * 365 days (Moment.js convention).
 */
export class DurationValue {
  /** Whole calendar months, applied by calendar in date arithmetic. */
  months: number
  /** Elapsed milliseconds, including those from day and week units. */
  ms: number
  /**
   * How much of `ms`, in days, was written in day or week units. Date
   * arithmetic moves the calendar date by these, as Moment does with a
   * duration's days; the rest of `ms` (hours, minutes, a date difference) is
   * elapsed time. Numeric contexts see only `ms`, which already counts them.
   */
  calendarDays: number

  constructor(months: number, ms: number, calendarDays = 0) {
    this.months = months
    this.ms = ms
    this.calendarDays = calendarDays
  }

  /** Total milliseconds using Moment's 30-day-month / 365-day-year convention. */
  get totalMs(): number {
    const years = Math.trunc(this.months / 12)
    const months = this.months - years * 12
    return years * 365 * 86400000 + months * 30 * 86400000 + this.ms
  }
}

/** A link to a note or a URL, as `link("a")` or a frontmatter `[[a]]` produces it. */
export class LinkValue {
  /** The target as written, including any `#heading` subpath. */
  target: string
  /** The display text after `|`, or null when none was written. */
  display: string | null
  /** True for a URL with a scheme, which never resolves to a note. */
  external: boolean
  /** The vault path of the note the target resolves to, or null when it resolves to none. */
  resolvedPath: string | null

  constructor(
    target: string,
    display: string | null,
    external: boolean,
    resolvedPath: string | null,
  ) {
    this.target = target
    this.display = display
    this.external = external
    this.resolvedPath = resolvedPath
  }
}

/** A note as a value: the result of `file()`, `this` and `asFile()`. */
export class FileValue {
  /** The note this value stands for. */
  note: VaultNote

  constructor(note: VaultNote) {
    this.note = note
  }
}

/** A regular expression literal, such as `/ab+/i`. */
export class RegexpValue {
  /** The compiled expression. */
  regex: RegExp

  constructor(regex: RegExp) {
    this.regex = regex
  }
}

/** HTML text from `html()`. Display only: nothing in this package renders or escapes it. */
export class HtmlValue {
  /** The HTML source. */
  html: string

  constructor(html: string) {
    this.html = html
  }
}

/** An image reference from `image()`. Display only. */
export class ImageValue {
  /** The image source: a path, a URL or a link value. */
  src: Value

  constructor(src: Value) {
    this.src = src
  }
}

/** An icon name from `icon()`. Display only. */
export class IconValue {
  /** The icon name as written. */
  name: string

  constructor(name: string) {
    this.name = name
  }
}

/**
 * An evaluation error held as a value, so one bad cell does not fail a query. {@link evaluateSafe}
 * and the query functions produce it. It is falsy, and {@link toDisplayString} shows it as `Error: <message>`.
 */
export class ErrorValue {
  /** What went wrong. */
  message: string

  constructor(message: string) {
    this.message = message
  }
}

/**
 * Any value an expression can produce. Strings, numbers, booleans, null, lists and plain objects
 * are JavaScript natives. The rest are the classes of this module.
 */
export type Value =
  | null
  | string
  | number
  | boolean
  | Value[]
  | { [key: string]: Value }
  | DateValue
  | DurationValue
  | LinkValue
  | FileValue
  | RegexpValue
  | HtmlValue
  | ImageValue
  | IconValue
  | ErrorValue

/**
 * Thrown by {@link evaluate} and by value helpers such as {@link compareValues} when an
 * expression cannot be evaluated: a type error, an unknown function, a circular formula or a bad
 * argument. Not the global `EvalError`. {@link evaluateSafe} turns it into an {@link ErrorValue}.
 */
export class ExpressionEvalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExpressionEvalError'
  }
}

export function isList(v: Value): v is Value[] {
  return Array.isArray(v)
}

export function isPlainObject(v: Value): v is { [key: string]: Value } {
  return typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype
}

/** Type name as reported by isType() / used for method dispatch. */
export function typeName(v: Value): string {
  if (v === null) return 'null'
  if (typeof v === 'string') return 'string'
  if (typeof v === 'number') return 'number'
  if (typeof v === 'boolean') return 'boolean'
  if (Array.isArray(v)) return 'list'
  if (v instanceof DateValue) return 'date'
  if (v instanceof DurationValue) return 'duration'
  if (v instanceof LinkValue) return 'link'
  if (v instanceof FileValue) return 'file'
  if (v instanceof RegexpValue) return 'regexp'
  if (v instanceof HtmlValue) return 'html'
  if (v instanceof ImageValue) return 'image'
  if (v instanceof IconValue) return 'icon'
  if (v instanceof ErrorValue) return 'error'
  return 'object'
}

/** JS-style truthiness; missing values (null) and errors are falsy. */
export function isTruthy(v: Value): boolean {
  if (v === null) return false
  if (v instanceof ErrorValue) return false
  if (typeof v === 'string') return v.length > 0
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v)
  if (typeof v === 'boolean') return v
  return true
}

/** isEmpty(): true for absent values, empty strings/lists/objects. */
export function isEmptyValue(v: Value): boolean {
  if (v === null) return true
  if (typeof v === 'string') return v.length === 0
  if (Array.isArray(v)) return v.length === 0
  if (isPlainObject(v)) return Object.keys(v).length === 0
  if (v instanceof ErrorValue) return true
  return false
}

// ---------------------------------------------------------------------------
// Date & duration parsing
// ---------------------------------------------------------------------------

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const DATE_TIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})?$/

function daysInMonth(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31
}

/**
 * The date regexes constrain digit count, not range, and both `new Date(y, m,
 * d, ...)` and ISO string parsing normalize overflow rather than rejecting it —
 * so `2025-02-30` would silently become March 2. These two range-check the
 * components before they are trusted; anything out of range is not a date.
 */
function isRealDate(year: number, month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}

/** Seconds allow 60: the ISO 8601 leap second folds into the following minute. */
function isRealTime(hours: number, minutes: number, seconds: number): boolean {
  return hours <= 23 && minutes <= 59 && seconds <= 60
}

/**
 * A local date-time. `new Date(y, m, d, ...)` reads a year of 0-99 as 1900+y,
 * so the year goes in through setFullYear, which takes it as written. Any
 * component may overflow and roll over, as the Date constructor's do.
 */
export function localDate(
  year: number,
  monthIndex: number,
  day: number,
  hours = 0,
  minutes = 0,
  seconds = 0,
  ms = 0,
): Date {
  const date = new Date(2000, 0, 1)
  date.setFullYear(year, monthIndex, day)
  date.setHours(hours, minutes, seconds, ms)
  return date
}

/** Parse a date string; returns null if not date-shaped. Local time unless a zone is given. */
export function parseDate(input: string): DateValue | null {
  const trimmed = input.trim()
  const dateOnly = DATE_ONLY_RE.exec(trimmed)
  if (dateOnly) {
    const [, y, m, d] = dateOnly
    if (!isRealDate(Number(y), Number(m), Number(d))) return null
    return new DateValue(localDate(Number(y), Number(m) - 1, Number(d)), false)
  }
  const dateTime = DATE_TIME_RE.exec(trimmed)
  if (dateTime) {
    const [, y, m, d, hh, mm, ss, ms, zone] = dateTime
    if (!isRealDate(Number(y), Number(m), Number(d))) return null
    if (!isRealTime(Number(hh), Number(mm), Number(ss ?? '0'))) return null
    if (zone) {
      // Date rejects ':60' in an ISO string, so a leap second is parsed as :59
      // and the extra second added after.
      const leap = ss === '60'
      const iso = `${y}-${m}-${d}T${hh}:${mm}:${leap ? '59' : (ss ?? '00')}${ms ? `.${ms}` : ''}${zone === 'Z' ? 'Z' : zone.includes(':') ? zone : `${zone.slice(0, 3)}:${zone.slice(3)}`}`
      const parsed = new Date(iso)
      if (Number.isNaN(parsed.getTime())) return null
      return new DateValue(leap ? new Date(parsed.getTime() + 1000) : parsed, true)
    }
    return new DateValue(
      localDate(
        Number(y),
        Number(m) - 1,
        Number(d),
        Number(hh),
        Number(mm),
        Number(ss ?? '0'),
        Number((ms ?? '0').padEnd(3, '0')),
      ),
      true,
    )
  }
  return null
}

const DAY_MS = 86400000

const DURATION_UNIT_MS: Record<string, number> = {
  w: 7 * 86400000,
  week: 7 * 86400000,
  weeks: 7 * 86400000,
  d: 86400000,
  day: 86400000,
  days: 86400000,
  h: 3600000,
  hour: 3600000,
  hours: 3600000,
  m: 60000,
  min: 60000,
  mins: 60000,
  minute: 60000,
  minutes: 60000,
  s: 1000,
  sec: 1000,
  secs: 1000,
  second: 1000,
  seconds: 1000,
  ms: 1,
  millisecond: 1,
  milliseconds: 1,
}

const DURATION_SEGMENT_RE = /(-?\d+(?:\.\d+)?)\s*([A-Za-z]+)/g

/**
 * Own-property lookup only. The unit is captured as `[A-Za-z]+`, which matches
 * inherited names like `toString` and `constructor`; a plain index would find
 * those on Object.prototype and multiply by a function, yielding NaN instead of
 * rejecting the string.
 */
function ownUnitMs(unit: string): number | undefined {
  return Object.hasOwn(DURATION_UNIT_MS, unit) ? DURATION_UNIT_MS[unit] : undefined
}

/**
 * Parse duration strings like "1d", "2h", "1 week", "1M", "1y 2M 3d".
 * 'M'/'mo'/month(s) and 'y'/'Y'/year(s) are calendar months/years; 'm' is minutes.
 */
export function parseDuration(input: string): DurationValue | null {
  const trimmed = input.trim()
  if (trimmed.length === 0) return null
  let months = 0
  let ms = 0
  let calendarDays = 0
  let matchedLength = 0
  for (const match of trimmed.matchAll(DURATION_SEGMENT_RE)) {
    const [, amountText, unit] = match
    // Both groups are non-optional in DURATION_SEGMENT_RE, so a match always
    // carries them; a segment without them is not a duration either way.
    if (amountText === undefined || unit === undefined) return null
    const amount = parseFloat(amountText)
    if (
      unit === 'M' ||
      unit.toLowerCase() === 'mo' ||
      unit.toLowerCase() === 'month' ||
      unit.toLowerCase() === 'months'
    ) {
      months += amount
    } else if (
      unit === 'y' ||
      unit === 'Y' ||
      unit.toLowerCase() === 'year' ||
      unit.toLowerCase() === 'years'
    ) {
      months += amount * 12
    } else {
      const unitMs = ownUnitMs(unit) ?? ownUnitMs(unit.toLowerCase())
      if (unitMs === undefined) return null
      ms += amount * unitMs
      // Day and week units count calendar days; the rest are elapsed time.
      if (unitMs % DAY_MS === 0) calendarDays += (amount * unitMs) / DAY_MS
    }
    matchedLength += match[0].length
  }
  if (matchedLength === 0 || trimmed.replace(DURATION_SEGMENT_RE, '').trim().length > 0) return null
  return new DurationValue(months, ms, calendarDays)
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime())
  const day = result.getDate()
  result.setMonth(result.getMonth() + months)
  // Clamp overflow (Jan 31 + 1M → Feb 28), matching Moment.
  if (result.getDate() !== day) result.setDate(0)
  return result
}

export function addDuration(date: DateValue, duration: DurationValue, sign: 1 | -1): DateValue {
  let result = date.date
  // Whole months move the calendar. setMonth would drop a fractional month, so
  // the fraction is counted at 30 days, the same as totalMs counts it.
  const wholeMonths = Math.trunc(duration.months)
  if (wholeMonths !== 0) result = addMonths(result, sign * wholeMonths)
  const monthFractionMs = Math.round((duration.months - wholeMonths) * 30 * DAY_MS)
  // Whole calendar days (day/week units, and the month fraction) move the
  // calendar date too; adding them as 86_400_000ms apiece leaves the clock an
  // hour off across a DST transition, so "1d" could land back on the day it
  // started. Everything else — hours, minutes, a date difference, a day
  // fraction — is elapsed time, so "36h" is 36 hours whichever days it spans.
  const calendarMs = Math.round(duration.calendarDays * DAY_MS) + monthFractionMs
  const days = Math.trunc(calendarMs / DAY_MS)
  const elapsedMs = Math.round(duration.ms + monthFractionMs - days * DAY_MS)
  if (days !== 0) {
    result = new Date(result.getTime())
    result.setDate(result.getDate() + sign * days)
  }
  result = new Date(result.getTime() + sign * elapsedMs)
  // A date without a time stays one when only the calendar moved, even where
  // that day starts at 01:00 (a DST change at midnight). With elapsed time
  // added it stays one only while the result still sits on midnight.
  const atMidnight =
    result.getHours() === 0 &&
    result.getMinutes() === 0 &&
    result.getSeconds() === 0 &&
    result.getMilliseconds() === 0
  return new DateValue(result, date.hasTime || (elapsedMs !== 0 && !atMidnight))
}

// ---------------------------------------------------------------------------
// Frontmatter conversion
// ---------------------------------------------------------------------------

const WIKILINK_VALUE_RE = /^\[\[([^\][|]+?)(?:\|([^\][]*))?\]\]$/

/**
 * A wikilink target without its `#heading` / `#^block` subpath, trimmed — the
 * form the scanner stores as `LinkRef.target`. The subpath names a place inside
 * the note, not a different note, so it takes no part in resolution. A
 * LinkValue keeps it in `target`, so the link still displays as written.
 */
export function linkPath(target: string): string {
  const hash = target.indexOf('#')
  return (hash === -1 ? target : target.slice(0, hash)).trim()
}

/**
 * Maps a link target to a vault path, or null when it names no note. `fromFrontmatter` calls it
 * for each wikilink string it converts; {@link runLinkResolver} builds the richer resolver an
 * {@link EvalContext} takes.
 */
export type LinkResolver = (target: string) => string | null

/**
 * Convert a raw YAML frontmatter value into a runtime Value.
 *
 * YAML aliases can make the parsed value cyclic (`m: &m {self: *m}`), so
 * `ancestors` holds the lists and objects being converted above this one; a
 * reference back to one of them becomes null rather than recursing until the
 * stack overflows. A value shared by two keys without a cycle converts at both.
 */
export function fromFrontmatter(
  raw: unknown,
  resolve: LinkResolver,
  ancestors: Set<object> = new Set(),
): Value {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'boolean' || typeof raw === 'number') return raw
  if (raw instanceof Date) return new DateValue(raw, true)
  if (typeof raw === 'string') {
    // Group 1 is required by WIKILINK_VALUE_RE, so reading it is the same test
    // as "did the pattern match".
    const [, linkTarget, linkDisplay] = WIKILINK_VALUE_RE.exec(raw.trim()) ?? []
    if (linkTarget !== undefined) {
      // The target keeps its `#heading` subpath for display and string
      // comparison; the resolver drops it, as the scanner does.
      const target = linkTarget.trim()
      return new LinkValue(target, linkDisplay?.trim() ?? null, false, resolve(target))
    }
    const date = parseDate(raw)
    if (date) return date
    return raw
  }
  if (typeof raw !== 'object') return null
  if (ancestors.has(raw)) return null
  ancestors.add(raw)
  try {
    if (Array.isArray(raw)) return raw.map((item) => fromFrontmatter(item, resolve, ancestors))
    const out: { [key: string]: Value } = {}
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      out[key] = fromFrontmatter(value, resolve, ancestors)
    }
    return out
  } finally {
    ancestors.delete(raw)
  }
}

// ---------------------------------------------------------------------------
// Equality & comparison
// ---------------------------------------------------------------------------

function linkEqualsFile(link: LinkValue, file: FileValue): boolean {
  return link.resolvedPath !== null && link.resolvedPath === file.note.file.path
}

function linkTargetsMatch(a: LinkValue, b: LinkValue): boolean {
  if (a.resolvedPath !== null || b.resolvedPath !== null) return a.resolvedPath === b.resolvedPath
  return a.target === b.target
}

/**
 * The equality `==` uses. Null equals only null and an error equals nothing. A link equals a note
 * it resolves to or a string that matches its target, and dates, durations and numbers compare by
 * their millisecond value.
 */
export function valueEquals(a: Value, b: Value): boolean {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  if (a instanceof ErrorValue || b instanceof ErrorValue) return false

  // Link/file cross-type equality.
  if (a instanceof LinkValue && b instanceof LinkValue) return linkTargetsMatch(a, b)
  if (a instanceof LinkValue && b instanceof FileValue) return linkEqualsFile(a, b)
  if (a instanceof FileValue && b instanceof LinkValue) return linkEqualsFile(b, a)
  if (a instanceof FileValue && b instanceof FileValue) return a.note.file.path === b.note.file.path
  // A link compared to a string compares the link text.
  if (a instanceof LinkValue && typeof b === 'string') return a.target === b
  if (typeof a === 'string' && b instanceof LinkValue) return b.target === a

  if (a instanceof DateValue || b instanceof DateValue) {
    const da = coerceToDate(a)
    const db = coerceToDate(b)
    if (da && db) return da.ms === db.ms
    return false
  }
  if (a instanceof DurationValue && b instanceof DurationValue) return a.totalMs === b.totalMs
  // Durations coerce to milliseconds in numeric contexts.
  if (a instanceof DurationValue && typeof b === 'number') return a.totalMs === b
  if (typeof a === 'number' && b instanceof DurationValue) return a === b.totalMs

  if (typeof a !== typeof b) return false
  if (typeof a === 'string' || typeof a === 'number' || typeof a === 'boolean') return a === b

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((item, i) => {
      const other = b[i]
      return other !== undefined && valueEquals(item, other)
    })
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    // Reading b's entry replaces the `k in b` test: a Value is never undefined,
    // so "absent" and "undefined" are the same answer.
    return (
      keysA.length === keysB.length &&
      keysA.every((k) => {
        const av = a[k]
        const bv = b[k]
        return av !== undefined && bv !== undefined && valueEquals(av, bv)
      })
    )
  }
  return a === b
}

/** Best-effort date coercion: DateValue passes through, date-shaped strings parse. */
export function coerceToDate(v: Value): DateValue | null {
  if (v instanceof DateValue) return v
  if (typeof v === 'string') return parseDate(v)
  return null
}

/** Ordering comparison for > < >= <=; throws ExpressionEvalError when incomparable. */
export function compareValues(a: Value, b: Value): number {
  if (a instanceof DateValue || b instanceof DateValue) {
    const da = coerceToDate(a)
    const db = coerceToDate(b)
    if (da && db) return da.ms - db.ms
  }
  if (a instanceof DurationValue || b instanceof DurationValue) {
    const ma = a instanceof DurationValue ? a.totalMs : typeof a === 'number' ? a : null
    const mb = b instanceof DurationValue ? b.totalMs : typeof b === 'number' ? b : null
    if (ma !== null && mb !== null) return ma - mb
  }
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  throw new ExpressionEvalError(`Cannot compare ${typeName(a)} with ${typeName(b)}`)
}

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

export function addValues(a: Value, b: Value): Value {
  // JS behavior: string concatenation when either side is a string. A string
  // that reads as a duration still adds to a date or duration as one, so the
  // date and duration branches fall through to here only when it does not.
  const concat = (): string => toDisplayString(a) + toDisplayString(b)
  const isString = typeof a === 'string' || typeof b === 'string'
  // Date + duration (string or DurationValue), either side.
  const dateA = a instanceof DateValue ? a : null
  const dateB = b instanceof DateValue ? b : null
  if (dateA || dateB) {
    const date = (dateA ?? dateB) as DateValue
    const other = dateA ? b : a
    const duration =
      other instanceof DurationValue
        ? other
        : typeof other === 'string'
          ? parseDuration(other)
          : null
    if (duration) return addDuration(date, duration, 1)
    if (isString) return concat()
    throw new ExpressionEvalError(`Cannot add ${typeName(a)} and ${typeName(b)}`)
  }
  if (a instanceof DurationValue || b instanceof DurationValue) {
    const da = a instanceof DurationValue ? a : typeof a === 'string' ? parseDuration(a) : null
    const db = b instanceof DurationValue ? b : typeof b === 'string' ? parseDuration(b) : null
    if (da && db) {
      return new DurationValue(
        da.months + db.months,
        da.ms + db.ms,
        da.calendarDays + db.calendarDays,
      )
    }
    if (isString) return concat()
    throw new ExpressionEvalError(`Cannot add ${typeName(a)} and ${typeName(b)}`)
  }
  if (typeof a === 'number' && typeof b === 'number') return a + b
  if (isString) return concat()
  throw new ExpressionEvalError(`Cannot add ${typeName(a)} and ${typeName(b)}`)
}

export function subtractValues(a: Value, b: Value): Value {
  if (a instanceof DateValue) {
    const db = coerceToDate(b)
    if (db && (b instanceof DateValue || parseDuration(b as string) === null)) {
      return new DurationValue(0, a.ms - db.ms)
    }
    const duration =
      b instanceof DurationValue ? b : typeof b === 'string' ? parseDuration(b) : null
    if (duration) return addDuration(a, duration, -1)
    throw new ExpressionEvalError(`Cannot subtract ${typeName(b)} from date`)
  }
  if (a instanceof DurationValue || b instanceof DurationValue) {
    const da = a instanceof DurationValue ? a : typeof a === 'string' ? parseDuration(a) : null
    const db = b instanceof DurationValue ? b : typeof b === 'string' ? parseDuration(b) : null
    if (da && db) {
      return new DurationValue(
        da.months - db.months,
        da.ms - db.ms,
        da.calendarDays - db.calendarDays,
      )
    }
    throw new ExpressionEvalError(`Cannot subtract ${typeName(b)} from ${typeName(a)}`)
  }
  if (typeof a === 'number' && typeof b === 'number') return a - b
  throw new ExpressionEvalError(`Cannot subtract ${typeName(b)} from ${typeName(a)}`)
}

export function multiplyValues(a: Value, b: Value): Value {
  // duration * scalar (scalar on the right per spec, accept left too).
  if (a instanceof DurationValue && typeof b === 'number')
    return new DurationValue(a.months * b, a.ms * b, a.calendarDays * b)
  if (typeof a === 'number' && b instanceof DurationValue)
    return new DurationValue(b.months * a, b.ms * a, b.calendarDays * a)
  if (typeof a === 'number' && typeof b === 'number') return a * b
  throw new ExpressionEvalError(`Cannot multiply ${typeName(a)} and ${typeName(b)}`)
}

export function divideValues(a: Value, b: Value): Value {
  if (a instanceof DurationValue && typeof b === 'number')
    return new DurationValue(a.months / b, a.ms / b, a.calendarDays / b)
  if (typeof a === 'number' && typeof b === 'number') return a / b
  throw new ExpressionEvalError(`Cannot divide ${typeName(a)} by ${typeName(b)}`)
}

export function moduloValues(a: Value, b: Value): Value {
  if (typeof a === 'number' && typeof b === 'number') return a % b
  throw new ExpressionEvalError(`Cannot compute ${typeName(a)} % ${typeName(b)}`)
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0')
}

export function formatDateIso(v: DateValue): string {
  const d = v.date
  const datePart = `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (!v.hasTime) return datePart
  const seconds = d.getSeconds()
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}${seconds ? `:${pad(seconds)}` : ''}`
  return `${datePart} ${time}`
}

export function formatDuration(v: DurationValue): string {
  const parts: string[] = []
  if (v.months !== 0) {
    const years = Math.trunc(v.months / 12)
    const months = v.months - years * 12
    if (years !== 0) parts.push(`${years} year${Math.abs(years) === 1 ? '' : 's'}`)
    if (months !== 0) parts.push(`${months} month${Math.abs(months) === 1 ? '' : 's'}`)
  }
  // Whole milliseconds: fractional amounts and scaling leave float residue in
  // `ms` that would otherwise surface as a "4.6e-10 ms" or "999.99 ms" part.
  let rest = Math.round(v.ms)
  const units: Array<[string, number]> = [
    ['day', 86400000],
    ['hour', 3600000],
    ['minute', 60000],
    ['second', 1000],
  ]
  for (const [label, unitMs] of units) {
    const amount = Math.trunc(rest / unitMs)
    if (amount !== 0) {
      parts.push(`${amount} ${label}${Math.abs(amount) === 1 ? '' : 's'}`)
      rest -= amount * unitMs
    }
  }
  if (rest !== 0) parts.push(`${rest} ms`)
  return parts.length > 0 ? parts.join(', ') : '0 seconds'
}

/** The text a value shows as in a table cell: a link shows its display text, a note its file name and a list its items joined by commas. */
export function toDisplayString(v: Value): string {
  if (v === null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.map(toDisplayString).join(', ')
  if (v instanceof DateValue) return formatDateIso(v)
  if (v instanceof DurationValue) return formatDuration(v)
  if (v instanceof LinkValue) return v.display ?? v.target
  if (v instanceof FileValue) return v.note.file.name
  if (v instanceof RegexpValue) return String(v.regex)
  if (v instanceof HtmlValue) return v.html
  if (v instanceof ImageValue) return toDisplayString(v.src)
  if (v instanceof IconValue) return v.name
  if (v instanceof ErrorValue) return `Error: ${v.message}`
  // A nested date, link or other class value shows as its display string;
  // stringified as-is it would print its internal fields.
  return JSON.stringify(v, (_key, member: Value) =>
    typeof member === 'object' && member !== null && !isList(member) && !isPlainObject(member)
      ? toDisplayString(member)
      : member,
  )
}

/** number() coercion: booleans → 1/0, dates → epoch ms, parseable strings → number; else error. */
export function toNumber(v: Value): number {
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v instanceof DateValue) return v.ms
  if (v instanceof DurationValue) return v.totalMs
  if (typeof v === 'string') {
    // Number('') and Number('  ') are 0, but a blank cell is empty, not zero:
    // the numeric summaries rely on this throwing to skip it.
    const parsed = v.trim() === '' ? NaN : Number(v)
    if (!Number.isNaN(parsed)) return parsed
    throw new ExpressionEvalError(`Cannot convert "${v}" to a number`)
  }
  throw new ExpressionEvalError(`Cannot convert ${typeName(v)} to a number`)
}
