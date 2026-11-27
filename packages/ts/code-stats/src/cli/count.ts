import { defineCommand } from '@osdlc/cli-tool/command'

import { countDirectory } from '../files/count.ts'
import type { Runners } from '../git/repo.ts'
import { countTree } from '../measure.ts'
import { renderCount } from '../report/render.ts'
import { countReportSchema } from '../report/schema.ts'
import { answer, COMMON_FLAGS, commonOptions, guarded, textOf } from './shared.ts'

/** `code-stats count` over the given runners. */
export function countCommand(runners: Runners) {
  return defineCommand({
    summary: 'Lines by kind, language and file group for a whole tree.',
    positionals: [
      {
        name: 'paths',
        variadic: true,
        help: 'Files or directories to count. Default: everything.',
      },
    ],
    flags: {
      rev: {
        kind: 'string',
        valueName: 'ref',
        help: 'Count a commit, read from git, instead of the files on disk.',
      },
      detail: { kind: 'boolean', help: 'Every language and a row per file.' },
      ...COMMON_FLAGS,
    },
    examples: ['count', 'count src --detail', 'count --rev HEAD~10 --json'],
    readOnly: true,
    output: countReportSchema,
    run: ({ flags, positionals: paths }, ctx) =>
      guarded(async () => {
        const options = {
          ...(await commonOptions(flags, ctx, runners)),
          paths,
          detail: flags.detail,
        }
        const report =
          flags.rev === undefined
            ? countDirectory({ dir: ctx.cwd, ...options })
            : countTree({ rev: flags.rev, ...options })
        return answer(ctx, report, () => `${renderCount(report, { detail: flags.detail })}\n`)
      }),
    text: textOf,
  })
}
