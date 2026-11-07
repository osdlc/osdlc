/**
 * What `rule-review` runs: `bin/rule-review.js` loads the built copy, and a
 * development checkout that devlink selects runs this file under Bun.
 *
 * `runMain` answers `rule-review dev …` and `--version`, hands off to a linked
 * checkout, and sets the exit code without calling `process.exit`, so output
 * still buffered for a pipe is not cut off. An error `main` does not catch is
 * rethrown as a plain one, so it exits 1 rather than with the code `runMain`
 * gives a classified git failure.
 */

import { runMain } from '@osdlc/cli-tool'
import { devlinkHook } from '@osdlc/cli-tool/devlink'

import { main } from './cli.ts'
import { DEVLINK_SPEC } from './devlink.ts'
import { VERSION } from './version.generated.ts'

async function bin(argv: readonly string[]): Promise<number> {
  try {
    return await main([...argv])
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : String(err))
  }
}

await runMain(bin, { name: 'rule-review', version: VERSION, devlink: devlinkHook(DEVLINK_SPEC) })
