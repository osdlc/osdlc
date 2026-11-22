/**
 * `diffkit <subcommand> …` — the one standalone binary. Works in any git
 * repository; a PR also needs `gh` authenticated.
 *
 * The subcommands are the `SUBCOMMANDS` table below. Change statistics are
 * `@osdlc/code-stats`'s `code-stats diff`.
 *
 * `src/bin.ts` runs `main` through `runMain`, which also answers
 * `--version` and `diffkit dev …`.
 *
 * Exit codes: 0 on success, 1 on a runtime failure, 2 on a malformed command
 * line (the subcommand's own codes pass through).
 */

import { EXIT, type CliContext } from '@osdlc/cli-tool'

import { prepMain } from './prep/command.ts'

const SUBCOMMANDS: Record<
  string,
  { summary: string; run: (argv: readonly string[], ctx: CliContext) => Promise<number> }
> = {
  prep: {
    summary: 'A JSON manifest of a change for review: files, groups, flags.',
    run: prepMain,
  },
}

function usage(): string {
  const rows = Object.entries(SUBCOMMANDS).map(([n, c]) => `  ${n.padEnd(8)}${c.summary}`)
  return `Usage: diffkit <command> [options]\n\nCommands:\n${rows.join('\n')}\n\nRun \`diffkit <command> --help\` for a command's options.\n`
}

export async function main(argv: readonly string[], ctx: CliContext): Promise<number> {
  const { io } = ctx
  const [name, ...rest] = argv
  if (name === undefined || name === '--help' || name === '-h') {
    io.stdout(usage())
    return name === undefined ? EXIT.usage : EXIT.ok
  }
  // Own keys only: `constructor` or `toString` must not find an Object.prototype member.
  const sub = Object.hasOwn(SUBCOMMANDS, name) ? SUBCOMMANDS[name] : undefined
  if (sub === undefined) {
    io.stderr(`diffkit: unknown command '${name}'\n${usage()}`)
    return EXIT.usage
  }
  return sub.run(rest, ctx)
}
