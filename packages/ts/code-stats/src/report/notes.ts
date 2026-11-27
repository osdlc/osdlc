import { isWithin } from '../paths.ts'
import type { ScanReader } from '../scan/registry.ts'

export const LINGUIST_UNREAD = 'linguist attributes could not be read'

/** How a note names the reader that read a file in place of its scanner. */
export const READER_NAME: Readonly<Record<Exclude<ScanReader, 'scanner'>, string>> = {
  table: 'the built-in language table',
  'one-line': 'the one-line comment rule',
}

/** The first `shown` items, then how many more. */
export function listed(items: readonly string[], shown = 5): string {
  const head = items.slice(0, shown).join(', ')
  return items.length > shown ? `${head}, and ${items.length - shown} more` : head
}

/** A note naming the `paths` asked for that hold none of `files`, or null when each holds some. */
export function emptyPathsNote(paths: readonly string[], files: readonly string[]): string | null {
  const empty = paths.filter((p) => p !== '.' && !files.some((f) => isWithin(f, p)))
  return empty.length === 0 ? null : `no files under ${listed(empty)}`
}
