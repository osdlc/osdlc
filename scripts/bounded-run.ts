// Runs a shell command with a hard time limit, for CI steps.
//
//   node scripts/bounded-run.ts <seconds> "<command>"
//
// On Windows, GitHub's step `timeout-minutes` can fail to end a step. The
// runner waits for the step's output pipe to close, and a process the test
// left behind can hold that pipe after its parent is gone. This script gives
// the command its own pipes and copies them to its output, so a leftover
// process holds a pipe nobody waits on.
//
// When the command exits, this script exits with its code, after at most
// EXIT_GRACE_MS for the pipes to drain. When the limit passes first, it kills
// the command's process tree and exits 124. Either way it does not wait on
// leftover processes. Raw child_process: it streams output live and manages
// the process tree itself.
import { spawn, spawnSync } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { constants } from 'node:os'
import { pathToFileURL } from 'node:url'

/** How long to wait for the pipes to close after the command exits. */
export const EXIT_GRACE_MS = 5_000
/** How long to wait for the command to exit after a kill. */
const KILL_GRACE_MS = 5_000
/** The exit code for a command that passed its limit, as coreutils `timeout`. */
export const TIMED_OUT = 124

const windows = process.platform === 'win32'

/** Kill `child` and, as far as the OS can find them, the processes under it. */
function killTree(child: ChildProcess): void {
  if (child.pid === undefined) return
  if (windows) {
    const root = process.env['SystemRoot'] ?? 'C:\\Windows'
    spawnSync(`${root}\\System32\\taskkill.exe`, ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
    })
    return
  }
  try {
    // The command leads its own process group (`detached` below).
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    // already gone
  }
}

/** Run `command` under a limit of `seconds`; resolve with the exit code to use. */
export function boundedRun(command: string, seconds: number): Promise<number> {
  const child = spawn(command, {
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: !windows,
    windowsHide: true,
  })
  child.stdout.on('data', (b: Buffer) => process.stdout.write(b))
  child.stderr.on('data', (b: Buffer) => process.stderr.write(b))

  return new Promise((resolve) => {
    let settled = false
    let timedOut = false
    const settle = (code: number) => {
      if (settled) return
      settled = true
      clearTimeout(limit)
      child.stdout.destroy()
      child.stderr.destroy()
      resolve(code)
    }

    const limit = setTimeout(() => {
      process.stderr.write(
        `::error::bounded-run: "${command}" passed its ${seconds}s limit; killing its process tree\n`,
      )
      timedOut = true
      killTree(child)
      setTimeout(() => settle(TIMED_OUT), KILL_GRACE_MS).unref()
    }, seconds * 1000)

    child.once('error', (err) => {
      process.stderr.write(`bounded-run: ${err.message}\n`)
      settle(1)
    })
    child.once('exit', (code, signal) => {
      if (timedOut) return settle(TIMED_OUT)
      // The limit must not fire while the pipes drain: the pid is gone.
      clearTimeout(limit)
      const result = code ?? (signal === null ? 1 : 128 + (constants.signals[signal] ?? 0))
      // `close` follows `exit` once both pipes have closed.
      const drained = new Promise<void>((done) => {
        const timer = setTimeout(done, EXIT_GRACE_MS)
        child.once('close', () => {
          clearTimeout(timer)
          done()
        })
      })
      void drained.then(() => {
        // Leftovers in the process group go too. Not on Windows: the pid may
        // already belong to another process.
        if (!windows) killTree(child)
        settle(result)
      })
    })
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [seconds, command, ...rest] = process.argv.slice(2)
  const limit = Number(seconds)
  if (!(limit > 0) || command === undefined || rest.length > 0) {
    process.stderr.write('usage: node scripts/bounded-run.ts <seconds> "<command>"\n')
    process.exit(2)
  }
  const code = await boundedRun(command, limit)
  // Flush first: pipe writes can be async. Then process.exit, not a natural
  // exit, so a handle a leftover process keeps open cannot hold this script.
  await new Promise((done) => process.stdout.write('', done))
  await new Promise((done) => process.stderr.write('', done))
  process.exit(code)
}
