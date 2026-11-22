/**
 * Moment.js-compatible date formatting for `date.format()` — implements the
 * commonly used token set, with Moment's default `en` locale. Literal text can
 * be escaped in [brackets].
 */

import { localDate } from './values.ts'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// getMonth() is 0-11 and getDay() is 0-6, so both tables are indexed in range;
// the fallbacks are unreachable and exist only because the compiler cannot see
// the platform's bounds.
const monthName = (d: Date): string => MONTHS[d.getMonth()] ?? ''
const dayName = (d: Date): string => DAYS[d.getDay()] ?? ''

function pad(n: number, width: number): string {
  return String(Math.abs(n)).padStart(width, '0')
}

/** A four-digit year token: Moment zero-fills a year under 1000 (`0050`). */
function year4(year: number): string {
  return year < 0 ? String(year) : pad(year, 4)
}

function ordinal(n: number): string {
  const rem10 = n % 10
  const rem100 = n % 100
  if (rem10 === 1 && rem100 !== 11) return `${n}st`
  if (rem10 === 2 && rem100 !== 12) return `${n}nd`
  if (rem10 === 3 && rem100 !== 13) return `${n}rd`
  return `${n}th`
}

function zoneOffset(d: Date, withColon: boolean): string {
  const offset = -d.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const hours = pad(Math.trunc(Math.abs(offset) / 60), 2)
  const minutes = pad(Math.abs(offset) % 60, 2)
  return `${sign}${hours}${withColon ? ':' : ''}${minutes}`
}

// Longest-first so e.g. MMMM wins over MM.
const TOKENS: Array<[string, (d: Date) => string]> = [
  ['YYYY', (d) => year4(d.getFullYear())],
  ['YY', (d) => pad(d.getFullYear() % 100, 2)],
  ['MMMM', monthName],
  ['MMM', (d) => monthName(d).slice(0, 3)],
  ['MM', (d) => pad(d.getMonth() + 1, 2)],
  ['Mo', (d) => ordinal(d.getMonth() + 1)],
  ['M', (d) => String(d.getMonth() + 1)],
  ['DDDD', (d) => pad(dayOfYear(d), 3)],
  ['DDD', (d) => String(dayOfYear(d))],
  ['DD', (d) => pad(d.getDate(), 2)],
  ['Do', (d) => ordinal(d.getDate())],
  ['D', (d) => String(d.getDate())],
  ['dddd', dayName],
  ['ddd', (d) => dayName(d).slice(0, 3)],
  ['dd', (d) => dayName(d).slice(0, 2)],
  ['d', (d) => String(d.getDay())],
  ['HH', (d) => pad(d.getHours(), 2)],
  ['H', (d) => String(d.getHours())],
  ['hh', (d) => pad(d.getHours() % 12 || 12, 2)],
  ['h', (d) => String(d.getHours() % 12 || 12)],
  ['kk', (d) => pad(d.getHours() || 24, 2)],
  ['k', (d) => String(d.getHours() || 24)],
  ['mm', (d) => pad(d.getMinutes(), 2)],
  ['m', (d) => String(d.getMinutes())],
  ['ss', (d) => pad(d.getSeconds(), 2)],
  ['s', (d) => String(d.getSeconds())],
  ['SSS', (d) => pad(d.getMilliseconds(), 3)],
  ['SS', (d) => pad(Math.trunc(d.getMilliseconds() / 10), 2)],
  ['S', (d) => String(Math.trunc(d.getMilliseconds() / 100))],
  ['A', (d) => (d.getHours() < 12 ? 'AM' : 'PM')],
  ['a', (d) => (d.getHours() < 12 ? 'am' : 'pm')],
  ['ZZ', (d) => zoneOffset(d, false)],
  ['Z', (d) => zoneOffset(d, true)],
  ['X', (d) => String(Math.trunc(d.getTime() / 1000))],
  ['x', (d) => String(d.getTime())],
  ['Qo', (d) => ordinal(Math.trunc(d.getMonth() / 3) + 1)],
  ['Q', (d) => String(Math.trunc(d.getMonth() / 3) + 1)],
  ['E', (d) => String(d.getDay() === 0 ? 7 : d.getDay())],
  ['e', (d) => String(d.getDay())],
  // Lower case is Moment's locale week, upper case the ISO week.
  ['ww', (d) => pad(localeWeekAnchor(d).week, 2)],
  ['w', (d) => String(localeWeekAnchor(d).week)],
  ['WW', (d) => pad(isoWeek(d), 2)],
  ['W', (d) => String(isoWeek(d))],
  ['GGGG', (d) => year4(isoWeekYear(d))],
  ['gggg', (d) => year4(localeWeekAnchor(d).year)],
]

function dayOfYear(d: Date): number {
  // Both ends are local midnight, so their span is a whole number of days give
  // or take a DST hour; rounding recovers that count. Subtracting the raw
  // timestamps and flooring would report the day before for every date inside
  // the DST window. localDate, not `new Date(y, ...)`, keeps a year under 100.
  const start = localDate(d.getFullYear(), 0, 1)
  const midnight = localDate(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((midnight.getTime() - start.getTime()) / 86400000) + 1
}

function isoWeekAnchor(d: Date): { week: number; year: number } {
  // ISO week: week containing the first Thursday of the year is week 1.
  const target = localDate(d.getFullYear(), d.getMonth(), d.getDate())
  const dayNumber = (target.getDay() + 6) % 7 // Monday = 0
  target.setDate(target.getDate() - dayNumber + 3) // nearest Thursday
  const year = target.getFullYear()
  const firstThursday = localDate(year, 0, 4)
  const firstDayNumber = (firstThursday.getDay() + 6) % 7
  firstThursday.setDate(firstThursday.getDate() - firstDayNumber + 3)
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86400000))
  return { week, year }
}

/**
 * Moment's default `en` locale week (dow 0, doy 6): weeks start on Sunday, and
 * week 1 is the week holding January 1. A week therefore belongs to the year
 * its Saturday falls in.
 */
function localeWeekAnchor(d: Date): { week: number; year: number } {
  const sunday = localDate(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay())
  const year = localDate(
    sunday.getFullYear(),
    sunday.getMonth(),
    sunday.getDate() + 6,
  ).getFullYear()
  const jan1 = localDate(year, 0, 1)
  const firstSunday = localDate(year, 0, 1 - jan1.getDay())
  // Both ends are local midnight; rounding absorbs a DST hour between them.
  const week = 1 + Math.round((sunday.getTime() - firstSunday.getTime()) / (7 * 86400000))
  return { week, year }
}

function isoWeek(d: Date): number {
  return isoWeekAnchor(d).week
}

function isoWeekYear(d: Date): number {
  return isoWeekAnchor(d).year
}

/**
 * Format a date with a Moment-style pattern, as `date.format()` does: `YYYY-MM-DD`, `dddd, MMMM D`,
 * `HH:mm`, and `[text]` for literal text. Weeks follow Moment's `en` locale or ISO, by token.
 */
export function formatDateMoment(date: Date, format: string): string {
  let out = ''
  let i = 0
  while (i < format.length) {
    // Escaped literal: [text]
    if (format[i] === '[') {
      const close = format.indexOf(']', i)
      if (close === -1) {
        out += format.slice(i + 1)
        break
      }
      out += format.slice(i + 1, close)
      i = close + 1
      continue
    }
    let matched = false
    for (const [token, fn] of TOKENS) {
      if (format.startsWith(token, i)) {
        out += fn(date)
        i += token.length
        matched = true
        break
      }
    }
    if (!matched) {
      out += format[i]
      i++
    }
  }
  return out
}

/** Moment's average month and year, which its duration humanizing divides by. */
const MONTH_MS = (146097 / 4800) * 86400000
const YEAR_MS = (146097 / 400) * 86400000

/**
 * Humanized relative time, e.g. "3 days ago" / "in 2 months". Follows Moment's
 * `relativeTime`: each unit's count is rounded first and the rounded count is
 * held against that unit's threshold, so 44.6 minutes reads as "an hour", not
 * "45 minutes". A date equal to now is in the past, as Moment has it.
 */
export function formatRelative(date: Date, now: Date): string {
  const diffMs = date.getTime() - now.getTime()
  const past = diffMs <= 0
  const text = relativeText(Math.abs(diffMs))
  return past ? `${text} ago` : `in ${text}`
}

function relativeText(abs: number): string {
  const seconds = Math.round(abs / 1000)
  if (seconds < 45) return 'a few seconds'
  const minutes = Math.round(abs / 60000)
  if (minutes <= 1) return 'a minute'
  if (minutes < 45) return `${minutes} minutes`
  const hours = Math.round(abs / 3600000)
  if (hours <= 1) return 'an hour'
  if (hours < 22) return `${hours} hours`
  const days = Math.round(abs / 86400000)
  if (days <= 1) return 'a day'
  if (days < 26) return `${days} days`
  const months = Math.round(abs / MONTH_MS)
  if (months <= 1) return 'a month'
  if (months < 11) return `${months} months`
  const years = Math.round(abs / YEAR_MS)
  return years <= 1 ? 'a year' : `${years} years`
}
