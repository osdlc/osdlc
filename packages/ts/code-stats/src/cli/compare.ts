import { defineCommand } from '@osdlc/cli-tool/command'

import { parseChangeSpec } from '../git/change.ts'
import type { Runners } from '../git/repo.ts'
import { compareChanges } from '../measure.ts'
import { renderCompare } from '../report/render.ts'
import { compareReportSchema } from '../report/schema.ts'
import { CHANGE_HELP } from './diff.ts'
import { answer, COMMON_FLAGS, commonOptions, guarded, textOf } from './shared.ts'

/** `code-stats compare` over the given runners. */
export function compareCommand(runners: Runners) {
  return defineCommand({
    summary: 'Two changes measured the same way, side by side.',
    positionals: [
      { name: 'a', required: true, help: CHANGE_HELP },
      { name: 'b', required: true, help: 'The second change, in the same forms.' },
    ],
    flags: COMMON_FLAGS,
    examples: ['compare 123 456', 'compare main~5..main~4 main~1..main --json'],
    readOnly: true,
    output: compareReportSchema,
    run: ({ flags, positionals: [a, b] }, ctx) =>
      guarded(async () => {
        const report = compareChanges(
          parseChangeSpec(a!),
          parseChangeSpec(b!),
          await commonOptions(flags, ctx, runners),
        )
        return answer(ctx, report, () => `${renderCompare(report)}\n`)
      }),
    text: textOf,
  })
}
