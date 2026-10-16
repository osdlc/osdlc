/**
 * A stand-in host process for the signal-forwarding tests. Installs group
 * signal forwarding, starts a process-group child that forks a grandchild,
 * prints the grandchild's pid, then waits to be signalled.
 *
 * Flags: `--stubborn` makes the grandchild ignore SIGTERM; `--own-handler`
 * gives the host its own SIGTERM listener that exits 7 after 700 ms;
 * `--own-handler-immediate` gives it one that exits 9 at once; `--own-once`
 * gives it a `process.once` listener, added before the group starts, that
 * starts one more group run after 700 ms, prints `later=<result>` and exits 7;
 * `--long-grace` sets `graceMs` to 30 s; `--async-background` starts the group
 * through the async runner instead, whose `sh` leaves a background grandchild
 * and exits at once.
 */

import {
  installGroupSignalForwarding,
  managedProcessRunner,
  spawnRunnerAsync,
} from '../../index.ts'

const stubborn = process.argv.includes('--stubborn')
const ownHandler = process.argv.includes('--own-handler')

const longGrace = process.argv.includes('--long-grace')
const ownHandlerImmediate = process.argv.includes('--own-handler-immediate')
const ownOnce = process.argv.includes('--own-once')
const asyncBackground = process.argv.includes('--async-background')

installGroupSignalForwarding({ graceMs: longGrace ? 30_000 : 500 })
if (ownHandler) process.on('SIGTERM', () => setTimeout(() => process.exit(7), 700))
// Exits at once, before any grace: the `exit` handler must still reap the group.
if (ownHandlerImmediate) process.on('SIGTERM', () => process.exit(9))
if (ownOnce) {
  process.once('SIGTERM', () => {
    setTimeout(async () => {
      const later = await spawnRunnerAsync('sh').run(['-c', 'true'], {
        cwd: process.cwd(),
        processGroup: true,
      })
      process.stdout.write(`later=${later.reason ?? later.exitCode}\n`)
      process.exit(7)
    }, 700)
  })
}

const script = stubborn
  ? `trap "" TERM; sleep 30 & echo grandchild=$!; wait`
  : `sleep 30 & echo grandchild=$!; wait`
if (asyncBackground) {
  // The run settles when `sh` exits; the grandchild holds no pipe and outlives it.
  const r = await spawnRunnerAsync('sh').run(
    ['-c', 'sleep 30 >/dev/null 2>&1 & echo grandchild=$!'],
    { cwd: process.cwd(), processGroup: true },
  )
  process.stdout.write(r.stdout)
} else {
  // The managed runner inherits stdio, so the child's `grandchild=<pid>` line reaches the test.
  void managedProcessRunner('sh').run(['-c', script], {
    cwd: process.cwd(),
    processGroup: true,
  })
}
// Keep the host alive: only a forwarded signal ends it.
setInterval(() => {}, 1000)
