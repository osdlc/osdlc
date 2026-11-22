/**
 * `diffkit prep [<pr>|--base <ref> [--head <ref>]|[--base <ref>] --worktree] [--group-size <n>]` — prints one JSON manifest for a
 * reviewer on stdout. Works in any git repository; the checkout is the cwd.
 *
 * Exit codes: 0 on success, 1 when the change could not be read, 2 on a
 * malformed command line.
 */

import { EXIT, defineCli, type CliContext } from '@osdlc/cli-tool'
import { parseChangeSpec } from '@osdlc/code-stats'
import { spawnRunner } from '@osdlc/command-seam'

import { DiffkitError } from '../error.ts'
import { runPrep } from './run.ts'

/** The PR number `raw` names, by {@link parseChangeSpec}'s rule, else null. */
function prNumber(raw: string): number | null {
  try {
    const spec = parseChangeSpec(raw)
    return spec.kind === 'pr' ? spec.number : null
  } catch {
    return null
  }
}

const cli = defineCli({
  name: 'diffkit prep',
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
})

export async function prepMain(argv: readonly string[], ctx: CliContext): Promise<number> {
  const { io } = ctx
  const parsed = cli.parse(argv, io)
  if (parsed.status === 'help') return EXIT.ok
  if (parsed.status === 'error') {
    io.stderr(`diffkit prep: ${parsed.message}\n`)
    return EXIT.usage
  }
  const v = parsed.values
  const raw = parsed.positionals[0]
  const pr = raw === undefined ? null : prNumber(raw)
  if (raw !== undefined && pr === null) {
    io.stderr(`diffkit prep: not a PR number: '${raw}'\n`)
    return EXIT.usage
  }
  let groupSize: number | undefined
  if (v.groupSize !== undefined) {
    groupSize = Number(v.groupSize)
    if (!/^\d+$/.test(v.groupSize) || !Number.isSafeInteger(groupSize)) {
      io.stderr(`diffkit prep: --group-size must be a whole number, 0 or more\n`)
      return EXIT.usage
    }
  }
  try {
    const manifest = runPrep(
      {
        cwd: ctx.cwd,
        pr,
        base: v.base ?? null,
        head: v.head ?? null,
        worktree: v.worktree,
        ...(groupSize === undefined ? {} : { thresholds: { groupSize } }),
      },
      { git: spawnRunner('git'), gh: spawnRunner('gh') },
    )
    io.stdout(`${JSON.stringify(manifest, null, 2)}\n`)
    return EXIT.ok
  } catch (e) {
    if (!(e instanceof DiffkitError)) throw e
    io.stderr(`diffkit prep: ${e.message}\n`)
    return e.usage ? EXIT.usage : EXIT.error
  }
}
