/**
 * Reset-time parsing for rate-limit messages: the three ways a CLI states when
 * a limit lifts. Each parser returns null when the text has none, and never
 * throws.
 *
 *   - an epoch-seconds stamp after a pipe: `usage limit reached|1760000000`
 *   - a duration: `try again in 2 hours 13 minutes`
 *   - a wall-clock time, with an optional date and IANA zone:
 *     `resets 3pm (America/Los_Angeles)`, `try again at Oct 20th, 2026 3:15 PM`
 *
 * A wall-clock time with no zone is the machine's local time. With no date it
 * is the next such time after `now`.
 */

const UNIT_MS: Record<string, number> = {
  d: 86_400_000,
  day: 86_400_000,
  h: 3_600_000,
  hr: 3_600_000,
  hour: 3_600_000,
  m: 60_000,
  min: 60_000,
  minute: 60_000,
  s: 1_000,
  sec: 1_000,
  second: 1_000,
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** `...|1760000000`: epoch seconds after a pipe. */
export function parseEpochReset(text: string): Date | null {
  const m = /\|\s*(\d{10})\b/.exec(text)
  if (m === null) return null
  return new Date(Number(m[1]) * 1000)
}

/** `in 2 hours 13 minutes`, `in 90s`, `in 1.5 hours`: the instant that long after `now`. */
export function parseRelativeReset(text: string, now: Date): Date | null {
  const lead = /\b(?:try again|retry|resets?|available again)\b[^.\n]*?\b(?:in|after)\s+/i.exec(
    text,
  )
  if (lead === null) return null
  const rest = text.slice(lead.index + lead[0].length)
  const part =
    /^(\d+(?:\.\d+)?)\s*(days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b[\s,]*(?:and\s+)?/i
  let remaining = rest
  let ms = 0
  let matched = false
  for (;;) {
    const m = part.exec(remaining)
    if (m === null) break
    const word = m[2]!.toLowerCase()
    const per = UNIT_MS[word.length > 1 ? word.replace(/s$/, '') : word]
    if (per === undefined) break
    ms += Number(m[1]) * per
    matched = true
    remaining = remaining.slice(m[0].length)
  }
  return matched && ms > 0 ? new Date(now.getTime() + ms) : null
}

function zoneParts(at: Date, zone: string): { y: number; mo: number; d: number; offsetMs: number } {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  })
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, Number(x.value)]))
  const asUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!)
  return {
    y: p.year!,
    mo: p.month!,
    d: p.day!,
    offsetMs: asUtc - Math.floor(at.getTime() / 1000) * 1000,
  }
}

/** The instant the wall-clock fields read in `zone` (local time when undefined). */
function atWallClock(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  zone: string | undefined,
): Date {
  if (zone === undefined) return new Date(y, mo - 1, d, h, mi)
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const first = guess - zoneParts(new Date(guess), zone).offsetMs
  return new Date(guess - zoneParts(new Date(first), zone).offsetMs)
}

function to24(hour: number, meridiem: string): number {
  const pm = meridiem.toLowerCase() === 'pm'
  return (hour % 12) + (pm ? 12 : 0)
}

/**
 * `resets 3pm (America/Los_Angeles)`, `resets at 3:30 pm`, `try again at 3:45 PM`,
 * `try again at Oct 20th, 2026 3:15 PM`. A bad zone name makes the whole parse null.
 */
export function parseWallClockReset(text: string, now: Date): Date | null {
  const re =
    /\b(?:resets?|try again|available again)\s+(?:at\s+)?(?:(?:on\s+)?([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?,?\s+(?:at\s+)?)?(\d{1,2})(?::(\d{2}))?\s*([ap]m)\b(?:\s*\(([A-Za-z_]+(?:\/[A-Za-z_+\-0-9]+)+|UTC)\))?/i
  const m = re.exec(text)
  if (m === null) return null
  const [, mon, day, year, hourText, minText, meridiem, zone] = m
  const hour = Number(hourText)
  if (hour < 1 || hour > 12) return null
  const h = to24(hour, meridiem!)
  const mi = minText === undefined ? 0 : Number(minText)
  try {
    if (zone !== undefined) new Intl.DateTimeFormat('en-US', { timeZone: zone })
    const monthIdx = mon === undefined ? -1 : MONTHS.indexOf(mon.toLowerCase())
    if (mon !== undefined && monthIdx === -1) return null
    const today =
      zone === undefined
        ? { y: now.getFullYear(), mo: now.getMonth() + 1, d: now.getDate() }
        : zoneParts(now, zone)
    if (monthIdx !== -1) {
      const y = year === undefined ? today.y : Number(year)
      let at = atWallClock(y, monthIdx + 1, Number(day), h, mi, zone)
      // A dated reset with no year that already passed means next year.
      if (year === undefined && at.getTime() <= now.getTime()) {
        at = atWallClock(y + 1, monthIdx + 1, Number(day), h, mi, zone)
      }
      return at
    }
    let at = atWallClock(today.y, today.mo, today.d, h, mi, zone)
    if (at.getTime() <= now.getTime()) {
      const next = new Date(Date.UTC(today.y, today.mo - 1, today.d + 1))
      at = atWallClock(
        next.getUTCFullYear(),
        next.getUTCMonth() + 1,
        next.getUTCDate(),
        h,
        mi,
        zone,
      )
    }
    return at
  } catch {
    return null
  }
}

/** The first reset time the text states, in the order epoch, duration, wall clock. */
export function parseReset(text: string, now: Date): Date | null {
  return parseEpochReset(text) ?? parseRelativeReset(text, now) ?? parseWallClockReset(text, now)
}

export function limitLabel(text: string): string {
  if (/weekly/i.test(text)) return 'weekly limit'
  const hours = /(\d+)-hour/i.exec(text)
  if (hours !== null) return `${hours[1]}-hour limit`
  if (/session limit|hit your session/i.test(text)) return 'session limit'
  const model = /\b(opus|sonnet) limit/i.exec(text)
  if (model !== null) return `${model[1]!.toLowerCase()} limit`
  if (/usage limit|hit your (?:usage )?limit/i.test(text)) return 'usage limit'
  if (/\b429\b|too many requests|rate_limit/i.test(text)) return 'rate limited (429)'
  return 'rate limit'
}
