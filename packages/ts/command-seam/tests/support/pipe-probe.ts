/**
 * Probe for the production sync capture path. `spawnRunner` reads
 * `NODE_ENV === 'test'` once at import time and switches to a temp-file
 * capture; `bun test` sets it, so this script is run in a child with
 * `NODE_ENV` removed. It runs a fixed matrix of cases through the real
 * `spawnRunner` pipe path and writes `{ [caseName]: result }` as JSON to the
 * file named by argv[2] (not stdout: the pipe capture is what is under test).
 *
 * Not a `*.test.ts` file, so `bun test` does not collect it.
 */

import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { runJson, runShell, shellRunner, spawnRunner } from '../../index.ts'

const out = process.argv[2]
if (out === undefined) throw new Error('usage: pipe-probe.ts <result-file>')

const CWD = process.cwd()
const sh = spawnRunner('sh')
const results: Record<string, unknown> = {}

function timed<T>(fn: () => T): { value: T; ms: number } {
  const t0 = performance.now()
  const value = fn()
  return { value, ms: performance.now() - t0 }
}

const dir = realpathSync(mkdtempSync(join(tmpdir(), 'seam-probe-')))
try {
  results['nodeEnv'] = process.env['NODE_ENV'] ?? null
  results['capture'] = sh.run(['-c', 'echo out; echo err >&2; exit 3'], { cwd: CWD })
  results['input'] = spawnRunner('cat').run([], { cwd: CWD, input: 'over the seam\n' })
  results['largeOutput'] = (() => {
    const r = sh.run(['-c', 'head -c 3000000 /dev/zero | tr "\\0" x'], { cwd: CWD })
    return { exitCode: r.exitCode, length: r.stdout.length }
  })()
  results['timeoutIgnoresTerm'] = timed(() =>
    sh.run(['-c', "trap '' TERM; sleep 10"], { cwd: CWD, timeoutMs: 250 }),
  )
  results['timeoutPartialOutput'] = timed(() =>
    sh.run(['-c', 'echo before; sleep 10'], { cwd: CWD, timeoutMs: 500 }),
  )
  // A timeout kills the direct child only: the backgrounded `sleep` survives
  // and the test reaps it. The pid goes through a file, not the captured stdout.
  results['timeoutDirectChild'] = (() => {
    const pidFile = join(tmpdir(), `seam-probe-pid-${process.pid}`)
    const r = sh.run(['-c', `sleep 30 & echo $! > "${pidFile}"; wait`], {
      cwd: CWD,
      timeoutMs: 500,
    })
    const pid = Number(readFileSync(pidFile, 'utf8').trim())
    rmSync(pidFile, { force: true })
    return { neverExited: r.neverExited, pid }
  })()
  // The child exits at once, but the backgrounded `sleep` holds its stdout.
  // The pid goes through a file, and the test reaps it.
  results['grandchildHoldsPipes'] = (() => {
    const pidFile = join(tmpdir(), `seam-probe-held-${process.pid}`)
    const value = timed(() =>
      sh.run(['-c', `sleep 30 & echo $! > "${pidFile}"; echo hi`], { cwd: CWD, timeoutMs: 500 }),
    )
    const pid = Number(readFileSync(pidFile, 'utf8').trim())
    rmSync(pidFile, { force: true })
    return { ...value, pid }
  })()
  results['timeoutZero'] = (() => {
    try {
      sh.run(['-c', 'echo ran'], { cwd: CWD, timeoutMs: 0 })
      return 'ran'
    } catch (e) {
      return e instanceof Error ? e.name : String(e)
    }
  })()
  results['timeoutFraction'] = sh.run(['-c', 'exec sleep 10'], { cwd: CWD, timeoutMs: 1.5 })
  results['missingBinary'] = spawnRunner('definitely-not-a-real-binary-pipe').run([], { cwd: CWD })
  // A producer that never stops, so it is still writing when the cap kills it.
  results['outputCap'] = (() => {
    const r = sh.run(['-c', 'exec cat /dev/zero'], { cwd: CWD })
    return { ...r, stdout: r.stdout.length }
  })()
  // A 100-byte cap over 3-byte characters: at most 33 whole ones survive.
  results['outputCapSet'] = sh.run(
    ['-c', `i=0; while [ $i -lt 2000 ]; do printf '€'; i=$((i+1)); done; exec sleep 10`],
    { cwd: CWD, maxOutputBytes: 100 },
  )
  results['signalDeath'] = sh.run(['-c', 'kill -9 $$'], { cwd: CWD })
  results['genuineExit1'] = sh.run(['-c', 'exit 1'], { cwd: CWD })
  results['badCwd'] = sh.run(['-c', 'true'], { cwd: join(dir, 'no-such-dir') })
  results['cwd'] = sh.run(['-c', 'pwd -P'], { cwd: dir })

  process.env['PIPE_PROBE_INHERITED'] = 'inherited'
  results['envMerge'] = sh.run(['-c', 'echo "$PIPE_PROBE_ADDED:$PIPE_PROBE_INHERITED"'], {
    cwd: CWD,
    env: { PIPE_PROBE_ADDED: 'added' },
  })
  results['envUnset'] = sh.run(['-c', 'echo "${PIPE_PROBE_INHERITED-absent}"'], {
    cwd: CWD,
    env: { PIPE_PROBE_INHERITED: undefined },
  })
  results['argvInert'] = sh.run(
    [
      '-c',
      'for a in "$@"; do printf "[%s]" "$a"; done',
      'sh',
      'a b',
      '$(echo hacked)',
      ';touch pwned',
      "it's",
    ],
    { cwd: dir },
  )
  results['argvInertFiles'] = sh.run(['-c', 'ls -A'], { cwd: dir })
  results['epipe'] = timed(() =>
    sh.run(['-c', 'exec 0<&-; sleep 0.3'], { cwd: CWD, input: 'x'.repeat(4 * 1024 * 1024) }),
  )
  results['shell'] = runShell('echo "$0:$1"', { cwd: CWD, scriptName: 'nm', args: ['one'] })
  results['shellTimeout'] = runShell("trap '' TERM; sleep 10", { cwd: CWD, timeoutMs: 250 })
  results['shellMissingSh'] = shellRunner(spawnRunner('definitely-not-a-real-sh')).run('true', {
    cwd: CWD,
  })
  results['runJson'] = runJson(sh, ['-c', 'echo "[INFO] starting"; echo "{\\"a\\": 1}"'], {
    cwd: CWD,
    tolerateLeadingLog: true,
  })
} finally {
  rmSync(dir, { recursive: true, force: true })
  writeFileSync(out, JSON.stringify(results))
}
