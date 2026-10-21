// Text helpers shared by `lexical.ts` and the guard. Not exported by any entry.
// No filesystem and no `node:*` import: the `./lexical` entry loads this module.

import type { PathWarning } from './errors.ts'

/**
 * Rust's `Path::components` for a POSIX path: empty segments and `.` are
 * dropped, except a `.` that starts a relative path.
 */
export function components(path: string): { absolute: boolean; segs: string[] } {
  const absolute = path.startsWith('/')
  const segs = path
    .split('/')
    .filter((seg, i) => seg !== '' && (seg !== '.' || (i === 0 && !absolute)))
  return { absolute, segs }
}

/**
 * The components of an absolute POSIX path with `.` dropped and each `..`
 * removed with the component before it. A `..` at the root stays there.
 */
export function foldPosix(path: string): string[] {
  const out: string[] = []
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return out
}

/**
 * Microsoft's reserved device names, plus `COM0`, `LPT0`, `CONIN$` and
 * `CONOUT$`. The rule is in
 * docs/planning/decisions/D-06-api-makes-the-filesystem-visible.md.
 */
const RESERVED = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'CONIN$',
  'CONOUT$',
  ...['COM', 'LPT'].flatMap((port) => [...'0123456789', '¹', '²', '³'].map((n) => `${port}${n}`)),
])

/**
 * The Windows device names and alternate data streams in `rel`, a path that
 * `validateRelative` returned, in segment order. The base name of a segment
 * is its text up to the first `.` or `:`, with trailing spaces removed, and
 * is compared with ASCII letters folded only, as the Rust twin does. A reserved
 * base name wins over a `:`.
 */
export function windowsNames(rel: string): PathWarning[] {
  const found: PathWarning[] = []
  for (const segment of rel.split('/')) {
    const base = segment.split(/[.:]/, 1)[0]!.replace(/ +$/, '')
    if (RESERVED.has(asciiUpper(base))) found.push({ kind: 'reserved_name', segment })
    else if (segment.includes(':')) found.push({ kind: 'alternate_stream', segment })
  }
  return found
}

/** `text` with `a` to `z` made upper case and every other character kept, so `ı` stays `ı`. */
function asciiUpper(text: string): string {
  return text.replace(/[a-z]/g, (c) => c.toUpperCase())
}
