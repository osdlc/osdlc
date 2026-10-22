/**
 * A stand-in host shaped like a hook runner: it awaits one
 * `processGroup` run, then starts a second, then sets its own exit code.
 * Prints `first-started` once the first run is up, so the test can signal it.
 *
 * Args: the path the second run would create.
 */

import {
  forwardedExitCode,
  installGroupSignalForwarding,
  spawnRunnerAsync,
} from '../../src/index.ts'

const marker = process.argv[2]!
const cwd = process.cwd()

installGroupSignalForwarding({ graceMs: 500 })

async function main(): Promise<number> {
  const sh = spawnRunnerAsync('sh')
  const first = await sh.run(['-c', 'sleep 30'], {
    cwd,
    processGroup: true,
    onSpawn: () => process.stdout.write('first-started\n'),
  })
  // A warn-and-continue hook runner goes on to the next verb.
  const second = await sh.run(['-c', `touch '${marker}'`], { cwd, processGroup: true })
  process.stdout.write(`second=${second.reason ?? second.exitCode}\n`)
  return first.exitCode === 0 && second.exitCode === 0 ? 0 : 1
}

const code = await main()
// Keep the interrupt code over the host's own.
process.exitCode = forwardedExitCode() ?? code
