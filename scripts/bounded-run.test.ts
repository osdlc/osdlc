// Tests for bounded-run.ts. They run the script as CI does, on every OS.
//
//   node --test scripts/bounded-run.test.ts
import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { EXIT_GRACE_MS, TIMED_OUT } from './bounded-run.ts'

const script = fileURLToPath(new URL('./bounded-run.ts', import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'bounded-run-'))
after(() => rmSync(dir, { recursive: true, force: true }))

/** A command line that runs `code` under this Node. */
function node(name: string, code: string): string {
  const file = join(dir, `${name}.mjs`)
  writeFileSync(file, code)
  return `"${process.execPath}" "${file}"`
}

/** Runs bounded-run from Node, or from bash as a CI step does. */
function run(seconds: number, command: string, via: 'node' | 'bash' = 'node') {
  const t0 = performance.now()
  const argv = [script, String(seconds), command]
  const r =
    via === 'node'
      ? spawnSync(process.execPath, argv, { encoding: 'utf8', timeout: 60_000 })
      : spawnSync('bash', ['-c', [process.execPath, ...argv].map((a) => `'${a}'`).join(' ')], {
          encoding: 'utf8',
          timeout: 60_000,
        })
  return { ...r, ms: performance.now() - t0 }
}

const hasBash = spawnSync('bash', ['-c', 'exit 0']).status === 0

/**
 * A command that starts a detached child holding its stdout and prints the
 * child's pid, then exits 0 or, with `hang`, never exits.
 */
function withHolder(name: string, hang: boolean): string {
  const child = join(dir, `${name}-holder.mjs`)
  writeFileSync(child, 'setTimeout(() => {}, 60_000)')
  return node(
    name,
    `import { spawn } from 'node:child_process'
const c = spawn(${JSON.stringify(process.execPath)}, [${JSON.stringify(child)}], { detached: true, stdio: 'inherit' })
c.unref()
console.log(String(c.pid))
${hang ? 'setInterval(() => {}, 1000)' : ''}`,
  )
}

function reapHolder(stdout: string): void {
  const pid = Number(stdout.trim().split('\n')[0])
  if (!(pid > 0)) return
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // already gone
  }
}

test('passes the exit code and the output through', () => {
  const r = run(30, node('exit', "console.log('out'); console.error('err'); process.exit(3)"))
  assert.equal(r.status, 3)
  assert.equal(r.stdout.trim(), 'out')
  assert.equal(r.stderr.trim(), 'err')
})

test('a command past its limit is killed and exits 124', () => {
  const r = run(1, node('hang', 'setInterval(() => {}, 1000)'))
  assert.equal(r.status, TIMED_OUT)
  assert.match(r.stderr, /passed its 1s limit/)
  assert.ok(r.ms < 15_000, `took ${r.ms}ms`)
})

for (const via of ['node', 'bash'] as const) {
  const opts = { skip: via === 'bash' && !hasBash }

  test(`under ${via}: a leftover holding the pipes does not hold a run that exited`, opts, () => {
    const r = run(30, withHolder(`exit-${via}`, false), via)
    try {
      assert.equal(r.status, 0)
      assert.ok(r.ms < EXIT_GRACE_MS + 10_000, `took ${r.ms}ms`)
    } finally {
      reapHolder(r.stdout)
    }
  })

  test(
    `under ${via}: a hung command with a leftover holding the pipes ends at its limit`,
    opts,
    () => {
      const r = run(2, withHolder(`hang-${via}`, true), via)
      try {
        assert.equal(r.status, TIMED_OUT)
        assert.ok(r.ms < 20_000, `took ${r.ms}ms`)
      } finally {
        reapHolder(r.stdout)
      }
    },
  )
}
