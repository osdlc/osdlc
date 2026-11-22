/**
 * `long-function` (measured): a function of at least `longFunctionLines`
 * lines of which MORE than `longFunctionAddedShare` is added by this change.
 * Length is first line to last line, blank and comment lines inside included;
 * the share is the added lines inside that span over its length. Nested
 * functions are judged on their own, so a long outer function and the long
 * callback inside it can both be flagged. Test files are not considered: a
 * `describe` callback is long by construction.
 */

import { parseSource } from '@osdlc/code-stats'

import { functionsOf } from '../ast.ts'
import type { FlagContext, RawFlag } from './context.ts'

export function longFunctions(cx: FlagContext): RawFlag[] {
  const { longFunctionLines, longFunctionAddedShare } = cx.thresholds
  const out: RawFlag[] = []
  for (const file of cx.files) {
    if (file.group === 'tests') continue
    const text = cx.readHead(file.path)
    if (text === null) continue
    for (const fn of functionsOf(cx.ts, parseSource(cx.ts, file.path, text))) {
      const lines = fn.end - fn.start + 1
      if (lines < longFunctionLines) continue
      let added = 0
      for (const n of file.added) if (n >= fn.start && n <= fn.end) added += 1
      const addedShare = added / lines
      if (addedShare <= longFunctionAddedShare) continue
      out.push({
        kind: 'long-function',
        basis: 'measured',
        path: file.path,
        line: fn.start,
        detail: `${fn.name} is ${lines} lines and ${Math.round(addedShare * 100)}% of them are added`,
        measurements: { name: fn.name, lines, addedShare: Math.round(addedShare * 100) / 100 },
      })
    }
  }
  return out
}
