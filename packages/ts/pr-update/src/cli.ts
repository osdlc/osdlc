/**
 * `pr-update`: the standalone CLI, a `@osdlc/cli-tool` command tree.
 *
 * `survey` and `update` are declared in `commands.ts`; `config` and `trust`
 * are cli-tool's shared commands over pr-update's files (`config-cli.ts`).
 * `pr-update` alone prints the help and exits 0.
 *
 * Config layers and exit codes: see README.md (## Config, ## Exit codes); each
 * command's own exits are declared in commands.ts.
 *
 * `--remote` is the remote fetched, measured against (`<remote>/<branch>`) and,
 * for `update`, pushed to. `selectedCodeHostFor` in `code-host.ts` says how the
 * code host is chosen.
 */

import type { CliContext } from '@osdlc/cli-tool'
import { defineApp, type App } from '@osdlc/cli-tool/command'
import { trustCommand, type TrustService } from '@osdlc/cli-tool/trust-command'

import { PR_UPDATE_CONFIG_FILE, surveyCommand, updateCommand, type CliSeams } from './commands.ts'
import { configCommand } from './config-cli.ts'
import { prUpdateTrustStore } from './trust.ts'
import { VERSION } from './version.generated.ts'

export { PR_UPDATE_CONFIG_FILE, writeErrorReport, type CliSeams } from './commands.ts'

/** The whole-repository marker `pr-update trust` records, keyed on the working directory. */
const trustService: TrustService = {
  async trust(ctx) {
    const r = await prUpdateTrustStore(ctx.env).trust(ctx.cwd)
    return { root: r.root, trusted: true, by: 'marker', changed: !r.alreadyTrusted }
  },
  async untrust(ctx) {
    const store = prUpdateTrustStore(ctx.env)
    const root = await store.resolveRoot(ctx.cwd)
    const removed = await store.untrust(root)
    return { root, trusted: false, by: null, changed: removed }
  },
  async show(ctx) {
    const store = prUpdateTrustStore(ctx.env)
    const root = await store.resolveRoot(ctx.cwd)
    const trusted = await store.isTrusted(root)
    return { root, trusted, by: trusted ? 'marker' : null }
  },
  async list(ctx) {
    const roots = await prUpdateTrustStore(ctx.env).list()
    return roots.map((root) => ({ root, trusted: true, by: 'marker' }))
  },
}

/** Options for {@link createApp}. */
export interface AppOptions {
  /** Check each document against its schema before printing it. For tests. */
  checkOutput?: boolean
}

/** The `pr-update` command tree over `seams`: `survey`, `update`, `config` and `trust`. */
export function createApp(seams: CliSeams = {}, options: AppOptions = {}): App {
  return defineApp({
    name: 'pr-update',
    version: VERSION,
    summary: 'Survey and update out-of-date, stacked pull requests.',
    commands: {
      survey: surveyCommand(seams),
      update: updateCommand(seams),
      config: configCommand(seams.configFile ?? PR_UPDATE_CONFIG_FILE),
      trust: trustCommand(trustService, {
        summary: "record consent to run the commands this repository's config names",
        description:
          'The project file can name commands pr-update runs (lockfile_install, resolvers, ' +
          'repair.command, repair.agent, test_command). A setting the repository writes cannot ' +
          'authorize running it, so update refuses them (exit 21) until the repository is ' +
          'trusted. Trust is kept outside the repository, keyed on its resolved path. ' +
          '--trust on update allows one run without recording anything.',
      }),
    },
    ...(options.checkOutput === true ? { checkOutput: true } : {}),
  })
}

/** The commands whose `--branch` may be bare. */
const BRANCH_COMMANDS: ReadonlySet<string> = new Set(['survey', 'update'])

/** The flags that may come before the command word and take a value. */
const LEADING_VALUE_FLAGS: ReadonlySet<string> = new Set(['--output'])

/**
 * Give a bare `--branch` its meaning. The flag parser has no flag with an
 * optional value, so a `--branch` of `survey` or `update` that ends the line
 * or is followed by another flag becomes `--current-branch`, which the
 * command resolves to the branch checked out in the working directory.
 * Nothing after a `--` is touched.
 */
export function expandBareBranch(argv: readonly string[]): string[] {
  let at = -1
  for (let i = 0; i < argv.length; i++) {
    const word = argv[i]!
    if (word === '--') break
    if (!word.startsWith('-')) {
      at = i
      break
    }
    if (LEADING_VALUE_FLAGS.has(word)) i += 1
  }
  if (at === -1 || !BRANCH_COMMANDS.has(argv[at]!)) return [...argv]
  const out = argv.slice(0, at + 1)
  let ended = false
  for (let i = at + 1; i < argv.length; i++) {
    const word = argv[i]!
    if (word === '--') ended = true
    const next = argv[i + 1]
    const bare = word === '--branch' && (next === undefined || next.startsWith('-'))
    out.push(!ended && bare ? '--current-branch' : word)
  }
  return out
}

/** Returns an exit code and never exits. Reads nothing outside `ctx` and `seams`. */
export async function main(
  argv: readonly string[],
  ctx: CliContext,
  seams: CliSeams = {},
): Promise<number> {
  const app = createApp(seams)
  if (argv.length === 0) return app.run(['help'], ctx)
  return app.run(expandBareBranch(argv), ctx)
}
