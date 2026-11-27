import { defineCommand } from '@osdlc/cli-tool/command'
import { spawnRunner } from '@osdlc/command-seam'

import { CodeStatsError } from '../error.ts'
import { parseChangeSpec } from '../git/change.ts'
import type { Runners } from '../git/repo.ts'
import { runPrep } from '../prep/run.ts'
import { prepManifestSchema } from '../prep/schema.ts'
import { guarded, textOf } from './shared.ts'

/** The PR number `raw` names, by {@link parseChangeSpec}'s rule, else null. */
function prNumber(raw: string): number | null {
  try {
    const spec = parseChangeSpec(raw)
    return spec.kind === 'pr' ? spec.number : null
  } catch {
    return null
  }
}

const bad = (message: string) => new CodeStatsError(message, { kind: 'bad-input' })

/**
 * `code-stats prep` over the given runners: one JSON manifest of a change for a
 * reviewer, always JSON on stdout. The checkout is the working directory.
 */
export function prepCommand(runners: Runners) {
  return defineCommand({
    summary: 'A JSON manifest of a change for review: files, groups, flags.',
    positionals: [{ name: 'pr', help: 'PR number to prep. Omit to prep the current branch.' }],
    flags: {
      base: {
        kind: 'string',
        valueName: 'ref',
        help: "Ref to diff against (`<ref>...HEAD`). Default: the remote's default branch (`origin/HEAD`), else `origin/main`. Not with a PR. With --worktree: the merge base of <ref> and HEAD against the working tree.",
      },
      head: {
        kind: 'string',
        valueName: 'ref',
        help: 'With --base: exactly `<base>..<head>` (two-dot) instead of the branch.',
      },
      worktree: {
        kind: 'boolean',
        help: 'Prep the working tree, untracked files included: against HEAD, or with --base against its merge base with HEAD.',
      },
      groupSize: {
        kind: 'string',
        valueName: 'n',
        help: 'Files per group before a package group is split. Default 12; 0 turns splitting off.',
      },
    },
    examples: [
      'prep 123',
      'prep --base origin/main',
      'prep --base v1 --head v2',
      'prep --worktree',
    ],
    output: prepManifestSchema,
    run: ({ flags, positionals: [raw] }, ctx) =>
      guarded(() => {
        const pr = raw === undefined ? null : prNumber(raw)
        if (raw !== undefined && pr === null) throw bad(`not a PR number: '${raw}'`)
        for (const name of ['base', 'head'] as const) {
          if (flags[name]?.startsWith('-')) throw bad(`--${name} must not start with '-'`)
        }
        let groupSize: number | undefined
        if (flags.groupSize !== undefined) {
          groupSize = Number(flags.groupSize)
          if (!/^\d+$/.test(flags.groupSize) || !Number.isSafeInteger(groupSize)) {
            throw bad('--group-size must be a whole number, 0 or more')
          }
        }
        return runPrep(
          {
            cwd: ctx.cwd,
            pr,
            base: flags.base ?? null,
            head: flags.head ?? null,
            worktree: flags.worktree,
            ...(groupSize === undefined ? {} : { thresholds: { groupSize } }),
          },
          { git: runners.git ?? spawnRunner('git'), gh: runners.gh ?? spawnRunner('gh') },
        )
      }),
    text: textOf,
  })
}
