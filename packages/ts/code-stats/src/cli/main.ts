import type { CliContext } from '@osdlc/cli-tool'
import { defineApp, type App } from '@osdlc/cli-tool/command'

import type { Runners } from '../git/repo.ts'
import { VERSION } from '../version.generated.ts'
import { compareCommand } from './compare.ts'
import { countCommand } from './count.ts'
import { describeCommand } from './describe.ts'
import { diffCommand } from './diff.ts'

/**
 * The `code-stats` app over the given runners: `count`, `diff`, `compare` and
 * `describe`, plus the `help` and `schema` commands, `--help`, `--json`,
 * `--output` and `--version` that cli-tool's `defineApp` adds.
 */
export function createApp(runners: Runners = {}): App {
  return defineApp({
    name: 'code-stats',
    version: VERSION,
    summary: 'Lines of source by kind for a tree, a change, or two changes side by side.',
    commands: {
      count: countCommand(runners),
      diff: diffCommand(runners),
      compare: compareCommand(runners),
      describe: describeCommand(runners),
    },
  })
}

/** The CLI over the given runners, as a `main` for `runMain`. */
export function createMain(
  runners: Runners = {},
): (argv: readonly string[], ctx: CliContext) => Promise<number> {
  return createApp(runners).main
}

/** The CLI over the real `git` and `gh`. */
export const app = createApp()
