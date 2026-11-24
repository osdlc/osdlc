/**
 * Child process for `mirror.test.ts`: `node write-answer.child.ts <env json> <checkout> <at-ms>`
 * waits until `<at-ms>`, so two children write at once, then writes `checkout: <checkout>` to the
 * machine file of the environment given, over no file, as a first run that found none would.
 * Prints `wrote` or `yielded`.
 */
import { machineFile } from '../src/machine.ts'
import { writeMirrorAnswer } from '../src/mirror.ts'

const [env, checkout, at] = process.argv.slice(2) as [string, 'mirror' | 'local', string]
const wait = Number(at) - Date.now()
if (wait > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait)
const file = machineFile({ env: JSON.parse(env) as Record<string, string> })
const { wrote } = writeMirrorAnswer(file, { checkout }, { before: null, yield: true })
process.stdout.write(wrote ? 'wrote' : 'yielded')
