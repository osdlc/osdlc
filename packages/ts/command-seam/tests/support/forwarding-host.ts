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
 * `--long-grace` sets `graceMs` to 30 s; `--unref` starts the group with
 * `unref: true`, so forwarding does not track it; `--async-background` starts
 * the group through the async runner instead, whose `sh` leaves a background
 * grandchild and exits at once. `--exit` makes the host exit with code 0 on its
 * own instead of waiting for a signal: after that run settles, or, with
 * `--in-flight`, while an async run is still going.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
const unref = process.argv.includes('--unref')
const asyncBackground = process.argv.includes('--async-background')
const exitOnOwn = process.argv.includes('--exit')
const inFlight = process.argv.includes('--in-flight')

/** Write `text` to stdout and wait until it is flushed, so an exit cannot cut it off. */
const print = (text: string) => new Promise<void>((res) => process.stdout.write(text, () => res()))

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
if (inFlight) {
  // The async runner captures output, so `sh` hands over the grandchild's pid
  // through a file. The run never settles before the host exits.
  const dir = mkdtempSync(join(tmpdir(), 'forwarding-host-'))
  const pidFile = join(dir, 'pid')
  void spawnRunnerAsync('sh').run(['-c', 'sleep 30 & echo $! > "$1"; wait', 'sh', pidFile], {
    cwd: process.cwd(),
    processGroup: true,
  })
  let pid = ''
  while (pid === '') {
    await new Promise((res) => setTimeout(res, 25))
    try {
      pid = readFileSync(pidFile, 'utf8').trim()
    } catch {
      // Not written yet.
    }
  }
  rmSync(dir, { recursive: true, force: true })
  await print(`grandchild=${pid}\n`)
} else if (asyncBackground) {
  // The run settles when `sh` exits; the grandchild holds no pipe and outlives it.
  const r = await spawnRunnerAsync('sh').run(
    ['-c', 'sleep 30 >/dev/null 2>&1 & echo grandchild=$!'],
    { cwd: process.cwd(), processGroup: true },
  )
  await print(r.stdout)
} else {
  // The managed runner inherits stdio, so the child's `grandchild=<pid>` line reaches the test.
  void managedProcessRunner('sh').run(['-c', script], {
    cwd: process.cwd(),
    processGroup: true,
    ...(unref ? { unref: true } : {}),
  })
}
if (exitOnOwn) process.exit(0)
// Keep the host alive: only a forwarded signal ends it.
setInterval(() => {}, 1000)
