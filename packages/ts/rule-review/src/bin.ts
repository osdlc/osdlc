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

import { errorText } from './changeset.ts'
import { DEVLINK_SPEC } from './devlink.ts'
import { VERSION } from './version.generated.ts'

async function bin(argv: readonly string[]): Promise<number> {
  // Loaded here, not at the top: `--version` and a hand-off to a linked
  // checkout never need the review code, and a git hook pays for every load.
  const { main } = await import('./cli.ts')
  try {
    return await main([...argv])
  } catch (err) {
    throw new Error(errorText(err))
  }
}

await runMain(bin, { name: 'rule-review', version: VERSION, devlink: devlinkHook(DEVLINK_SPEC) })
