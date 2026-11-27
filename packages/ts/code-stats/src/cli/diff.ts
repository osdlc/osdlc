import { defineCommand } from '@osdlc/cli-tool/command'

import type { Runners } from '../git/repo.ts'
import { diffChange, writePrBody } from '../measure.ts'
import { renderDiff } from '../report/render.ts'
import { diffReportSchema } from '../report/schema.ts'
import {
  answer,
  changeSpecOf,
  COMMON_FLAGS,
  commonOptions,
  guarded,
  reportWrite,
  textOf,
} from './shared.ts'

export const CHANGE_HELP =
  'A PR number (`123`, `#123`), `a..b` (exactly a to b), `a...b` (what b added since a), ' +
  'or a ref (`ref...HEAD`).'

/** The change `diff` and `describe` measure when none is named. */
export const DEFAULT_CHANGE_HELP =
  "Default: the branch against the remote's default branch (`origin/HEAD`), else `origin/main`."

/** `code-stats diff` over the given runners. */
export function diffCommand(runners: Runners) {
  return defineCommand({
    summary: 'Statistics for one change: a PR, a revision pair or the working tree.',
    positionals: [{ name: 'change', help: `${CHANGE_HELP} ${DEFAULT_CHANGE_HELP}` }],
    flags: {
      worktree: {
        kind: 'boolean',
        help: 'Measure the working tree against HEAD, or with a ref against its merge base with HEAD.',
      },
      write: { kind: 'boolean', help: "Write the statistics into the PR's body (needs a PR)." },
      detail: { kind: 'boolean', help: 'Every file and complexity mover.' },
      ...COMMON_FLAGS,
    },
    examples: [
      'diff',
      'diff 123 --write',
      'diff main...HEAD --detail',
      'diff --worktree --json',
      'diff origin/main --worktree',
    ],
    output: diffReportSchema,
    run: ({ flags, positionals: [named] }, ctx) =>
      guarded(async () => {
        const { spec, writeTo } = changeSpecOf(flags, named)
        const report = diffChange(spec, await commonOptions(flags, ctx, runners))
        if (writeTo !== null) {
          const wrote = writePrBody(writeTo, renderDiff(report), { cwd: ctx.cwd, runners })
          reportWrite(ctx, writeTo, wrote, { wrote: 'the statistics', held: 'these statistics' })
        }
        return answer(ctx, report, () => `${renderDiff(report, { detail: flags.detail })}\n`)
      }),
    text: textOf,
  })
}
