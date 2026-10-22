/** Shared fakes for the CLI tests: every tool installed, and a `gh` with no open PRs. */

import type { CommandRunner } from '@osdlc/command-seam'

import type { CliSeams } from '../src/cli.ts'

/** A `PATH` lookup that finds every binary. */
export const allToolsInstalled = (binary: string): string => `/usr/bin/${binary}`

/** A `gh` that lists no PRs. */
export const emptyGh: CommandRunner = {
  run: () => ({ exitCode: 0, stdout: '[]', stderr: '' }),
}

/** The default remote the CLI fixtures give a repo, so the survey has a repository to list. */
export const FIXTURE_REMOTE = 'https://github.com/o/r.git'

/** Seams for a run where all tools exist and `gh` finds nothing. */
export const fakeTools: CliSeams = { which: allToolsInstalled, gh: emptyGh }
