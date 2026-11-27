import { defineCommand } from '@osdlc/cli-tool/command'
import { z } from 'zod'

import type { Runners } from '../git/repo.ts'
import { describeChange, writeDescription } from '../measure.ts'
import { diffReportSchema, packageMapSchema } from '../report/schema.ts'
import { CHANGE_HELP, DEFAULT_CHANGE_HELP } from './diff.ts'
import {
  answer,
  changeSpecOf,
  COMMON_FLAGS,
  commonOptions,
  guarded,
  reportWrite,
  textOf,
} from './shared.ts'

/** The `--json` form of `describe`: the change's report and its package map. */
const describeOutputSchema = z.object({ report: diffReportSchema, packages: packageMapSchema })

/** `code-stats describe` over the given runners. */
export function describeCommand(runners: Runners) {
  return defineCommand({
    summary:
      'A PR description: prompts for the prose, then the statistics, a package map and risk signals.',
    positionals: [{ name: 'change', help: `${CHANGE_HELP} ${DEFAULT_CHANGE_HELP}` }],
    flags: {
      worktree: {
        kind: 'boolean',
        help: 'Describe the working tree against HEAD, or with a ref against its merge base with HEAD.',
      },
      write: {
        kind: 'boolean',
        help: "Write it into the PR's body (needs a PR): the whole description into an empty body, else only the generated blocks.",
      },
      ...COMMON_FLAGS,
    },
    examples: ['describe', 'describe 123 --write'],
    output: describeOutputSchema,
    run: ({ flags, positionals: [named] }, ctx) =>
      guarded(async () => {
        const { spec, writeTo } = changeSpecOf(flags, named)
        const description = await describeChange(spec, await commonOptions(flags, ctx, runners))
        if (writeTo !== null) {
          const wrote = writeDescription(writeTo, description, { cwd: ctx.cwd, runners })
          reportWrite(ctx, writeTo, wrote, { wrote: 'the description', held: 'this description' })
        }
        const output = { report: description.report, packages: description.packages }
        return answer(ctx, output, () => description.markdown)
      }),
    text: textOf,
  })
}
