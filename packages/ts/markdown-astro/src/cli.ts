import { EXIT, runMain } from '@osdlc/cli-tool'
import { devlinkHook } from '@osdlc/cli-tool/devlink'

import { DEFAULT_CONFIG_NAME, loadConfig, resolveDefaultConfig } from './config.ts'
import { DEVLINK_SPEC } from './devlink.ts'
import { exportVault, transform } from './run.ts'
import type { RunStats } from './run.ts'
import { VERSION } from './version.generated.ts'

const HELP = `markdown-astro — map an Obsidian vault into Astro content collections

Usage:
  markdown-astro <command> [options]

Commands:
  transform        Vault  ->  Astro content collections (build input)
  export-vault     Astro content collections  ->  canonical vault
  check            Resolve everything, write nothing (dry run)

Options:
  -c, --config <path>   Config file (default: ${DEFAULT_CONFIG_NAME})
      --vault <dir>     Vault directory (default: the config's \`vault:\`, else <astroRoot>/vault)
      --clean           Delete destination dirs before writing (not when the source has no notes)
  -q, --quiet           Suppress per-collection progress
  -h, --help            Show this help
`

const COMMANDS = new Set(['transform', 'export-vault', 'check'])

function optionValue(argv: readonly string[], i: number, flag: string): string {
  const v = argv[i]
  if (v === undefined) throw new Error(`${flag} needs a value`)
  return v
}

function parseArgs(argv: readonly string[]) {
  const args = {
    command: '',
    config: undefined as string | undefined,
    vault: undefined as string | undefined,
    clean: false,
    quiet: false,
    help: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '-h' || a === '--help') args.help = true
    else if (a === '-q' || a === '--quiet') args.quiet = true
    else if (a === '--clean') args.clean = true
    else if (a === '-c' || a === '--config') args.config = optionValue(argv, ++i, a)
    else if (a === '--vault') args.vault = optionValue(argv, ++i, a)
    else if (a.startsWith('-')) throw new Error(`unknown option ${a} (see --help)`)
    else if (!args.command) args.command = a
    else throw new Error(`unexpected argument ${a} (see --help)`)
  }
  return args
}

function report(stats: RunStats, dryRun: boolean): void {
  const arrow = stats.direction === 'toAstro' ? 'vault → collections' : 'collections → vault'
  console.log(`\n${dryRun ? '[dry-run] ' : ''}${arrow}`)
  console.log(`  files:   ${stats.files}`)
  console.log(`  assets:  ${stats.assetsCopied} copied`)
  if (stats.assetsMissing.length) {
    console.log(
      `  ⚠ missing assets (${stats.assetsMissing.length}): ${stats.assetsMissing.slice(0, 8).join(', ')}${stats.assetsMissing.length > 8 ? ' …' : ''}`,
    )
  }
}

/** Run one command and return its exit code: 0 on success, 1 on a bad command line or, for `check`, missing assets. */
function main(argv: readonly string[]): number {
  const args = parseArgs(argv)
  if (args.help || !args.command) {
    console.log(HELP)
    return args.help ? 0 : 1
  }

  if (!COMMANDS.has(args.command)) {
    console.error(`Unknown command: ${args.command}\n`)
    console.log(HELP)
    return 1
  }

  const config = loadConfig(
    args.config ?? resolveDefaultConfig(),
    args.vault === undefined ? {} : { vault: args.vault },
  )
  const verbose = !args.quiet

  switch (args.command) {
    case 'transform':
      report(transform(config, { verbose, clean: args.clean }), false)
      break
    case 'export-vault':
      report(exportVault(config, { verbose, clean: args.clean }), false)
      break
    case 'check': {
      const stats = transform(config, { verbose, dryRun: true })
      report(stats, true)
      if (stats.assetsMissing.length) {
        console.error(
          `markdown-astro: check failed, missing assets (${stats.assetsMissing.length}): ${stats.assetsMissing.join(', ')}`,
        )
        return EXIT.error
      }
      break
    }
  }
  return 0
}

await runMain(main, {
  name: 'markdown-astro',
  version: VERSION,
  devlink: devlinkHook(DEVLINK_SPEC),
})
