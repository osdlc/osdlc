/**
 * What `rule-review` runs: `bin/rule-review.js` loads the built copy, and a
 * development checkout that devlink selects runs this file under Bun.
 *
 * `runMain` from `@osdlc/cli-tool` answers `dev` and `--version` and hands off
 * to a linked checkout. An error `main` does not catch is reported through
 * `fail` in exit.ts; it never exits 1, which means findings.
 */

import { runMain } from '@osdlc/cli-tool'
import { devlinkHook } from '@osdlc/cli-tool/devlink'

import { DEVLINK_SPEC } from './devlink.ts'
import { VERSION } from './version.generated.ts'

async function bin(argv: readonly string[]): Promise<number> {
  // Loaded here, not at the top: `--version` and a hand-off to a linked
  // checkout never need the review code, and a git hook pays for every load.
  const { main } = await import('./cli.ts')
  try {
    return await main([...argv])
  } catch (err) {
    const { fail } = await import('./exit.ts')
    return fail(err, argv.includes('--json'))
  }
}

await runMain(bin, { name: 'rule-review', version: VERSION, devlink: devlinkHook(DEVLINK_SPEC) })
