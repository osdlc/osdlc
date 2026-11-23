/**
 * The flags: a reading order for a reviewer, not findings. Each check is
 * cheap and deterministic and says where to look first; none of them proves
 * anything by being silent. `basis: measured` is a count taken from the diff
 * and the syntax tree; `heuristic` is a pattern that is often right and
 * sometimes not, with the limits written in its own module.
 *
 * Only the sources the `typescript` compiler reads are covered, TypeScript
 * and JavaScript, declaration files left out (`coverage: ['ts']` in the
 * manifest). Of those, only kept files are checked (see dropReason in
 * ../files.ts), and not those under `NOT_FIRST_PARTY` below. The checks need
 * the compiler API; when none can be found they are skipped and the manifest
 * says so in `notes`. `notes` also names the changed files too large to read.
 */

import { isTsSource, loadTypeScript, withParseMemo } from '@osdlc/code-stats'

import type { Checkout } from '../checkout.ts'
import { byPath } from '../files.ts'
import type { PrepFile, PrepFlag, Thresholds } from '../schema.ts'
import type { ChangedFile, FlagContext } from './context.ts'
import { longFunctions } from './long-function.ts'
import { testOnlyExports } from './test-only-export.ts'

/** Directories of build output, fixtures and vendored code that code-stats' built-in groups do not set aside. */
const NOT_FIRST_PARTY = /(?:^|\/)(?:dist|fixtures|vendored)\//

export interface FlagInput {
  thresholds: Thresholds
  checkout: Checkout
  kept: readonly PrepFile[]
  /** New-file line numbers this change added, per path. */
  addedAt: ReadonlyMap<string, readonly number[]>
  groupOf: ReadonlyMap<string, string>
  readHead(path: string): string | null
  readBase(path: string): string | null
  /** Kept paths whose head or base text was too large to read. */
  tooLarge: ReadonlySet<string>
}

export function raiseFlags(input: FlagInput): { flags: PrepFlag[]; notes: string[] } {
  try {
    return raise(input)
  } catch (e) {
    // A reading aid must never stop the manifest: say what failed and go on.
    return { flags: [], notes: [`the flags could not be computed: ${(e as Error).message}`] }
  }
}

function raise(input: FlagInput): { flags: PrepFlag[]; notes: string[] } {
  const ts = loadTypeScript(input.checkout.cwd)
  if (ts === null) {
    return {
      flags: [],
      notes: ['the typescript compiler API was not found, so no flag could be computed'],
    }
  }
  const files: ChangedFile[] = input.kept
    .filter((f) => f.status !== 'deleted' && isTsSource(f.path) && !NOT_FIRST_PARTY.test(f.path))
    .map((f) => ({
      path: f.path,
      group: f.group,
      added: new Set(input.addedAt.get(f.path) ?? []),
    }))
  // One file at a time: the memo keeps only the last two parses, so this is
  // what lets both checks share a file's head parse.
  const flags = files
    .flatMap((file) => {
      const cx: FlagContext = {
        ts,
        thresholds: input.thresholds,
        checkout: input.checkout,
        files: [file],
        readHead: input.readHead,
        readBase: input.readBase,
      }
      return withParseMemo(() => [...longFunctions(cx), ...testOnlyExports(cx)])
    })
    .map((f): PrepFlag => ({ ...f, group: input.groupOf.get(f.path) ?? '' }))
  flags.sort((a, b) => byPath(a, b) || a.line - b.line || (a.kind < b.kind ? -1 : 1))
  const unread = files.filter((f) => input.tooLarge.has(f.path)).map((f) => f.path)
  const notes =
    unread.length === 0
      ? []
      : [`too large to read, so the flags skipped them or saw one side only: ${unread.join(', ')}`]
  return { flags, notes }
}
