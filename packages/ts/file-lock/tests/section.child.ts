/**
 * Child process for `section.test.ts`:
 * `node section.child.ts <counter-file> <rounds> [staleMs]` bumps a counter under the lock.
 */
import { readFileSync, writeFileSync } from 'node:fs'

import { withLock } from '../src/index.ts'

const [counter, rounds, staleMs] = process.argv.slice(2) as [string, string, string | undefined]
for (let i = 0; i < Number(rounds); i++) {
  withLock(
    `${counter}.lock`,
    () => {
      const n = Number(readFileSync(counter, 'utf-8'))
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3) // widen the read-to-write window
      writeFileSync(counter, String(n + 1))
    },
    staleMs === undefined ? {} : { staleMs: Number(staleMs) },
  )
}
