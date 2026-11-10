/**
 * A stand-in host for the interrupt tests: installs command-seam's group
 * signal forwarding, then calls the agent. Run as a child node process, so the
 * signal it gets does not reach the test runner.
 *
 *   interrupt-host.mjs <emitted package dir> <agent binary> [--again]
 *
 * Prints `first=<reason|ok>` when the call ends. With `--again`, a second call
 * then prints its error as `second=<json>`.
 */
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { installGroupSignalForwarding } from '@osdlc/command-seam'

const [distDir, binary] = process.argv.slice(2)
const again = process.argv.includes('--again')
const load = (file) => import(pathToFileURL(join(distDir, file)).href)
const { customAdapter } = await load('adapters/custom.js')
const { callAgent } = await load('run.js')

installGroupSignalForwarding({ graceMs: 500 })
const adapter = customAdapter({ name: 'fake', binary, args: () => [] })
const spec = { prompt: 'hi' }

const first = await callAgent(adapter, spec)
process.stdout.write(`first=${first.error?.reason ?? 'ok'}\n`)
if (again) {
  const second = await callAgent(adapter, spec)
  process.stdout.write(`second=${JSON.stringify(second.error)}\n`)
}
