/** Writing a value as a reader sees it. Shared by the build and the browser, so both agree. */
import type { FieldFormat } from './config.ts'
import type { FieldKind } from './schema.ts'

/** The format a field kind gets when its config names none. */
export function defaultFormat(kind: FieldKind): FieldFormat {
  switch (kind) {
    case 'date':
      return { kind: 'date' }
    case 'datetime':
      return { kind: 'datetime' }
    case 'number':
      return { kind: 'number' }
    case 'enum':
      return { kind: 'badge' }
    case 'url':
      return { kind: 'link' }
    default:
      return { kind: 'text' }
  }
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/

/**
 * An ISO date or date and time in `locale`, read as UTC so a build and a browser in different
 * time zones write the same day. Text that is no ISO date comes back as it is.
 */
export function formatDate(value: string, format: FieldFormat, locale = 'en'): string {
  const m = ISO_DATE.exec(value)
  if (m === null) return value
  const date = new Date(
    Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)),
  )
  if (Number.isNaN(date.getTime())) return value
  const withTime = format.kind === 'datetime' && m[4] !== undefined
  return new Intl.DateTimeFormat(locale, {
    dateStyle: format.dateStyle ?? 'medium',
    ...(withTime ? { timeStyle: 'short' as const } : {}),
    timeZone: 'UTC',
  }).format(date)
}

/**
 * A number in `locale`, with the format's fraction digits and unit. Digits are grouped from
 * five up, so a year stays `1871`.
 */
export function formatNumber(value: number, format: FieldFormat, locale = 'en'): string {
  const text = new Intl.NumberFormat(locale, {
    useGrouping: 'min2',
    ...(format.digits === undefined ? {} : { maximumFractionDigits: format.digits }),
  }).format(value)
  return format.unit === undefined ? text : `${text} ${format.unit}`
}

/** A scalar as text under `format`: a date, a number, or the value as it is. */
export function formatScalar(
  value: string | number | boolean,
  format: FieldFormat,
  locale = 'en',
): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number')
    return format.kind === 'number' ? formatNumber(value, format, locale) : String(value)
  if (format.kind === 'date' || format.kind === 'datetime') return formatDate(value, format, locale)
  return value
}
