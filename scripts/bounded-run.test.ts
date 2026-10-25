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

function run(seconds: number, command: string) {
  const t0 = performance.now()
  const r = spawnSync(process.execPath, [script, String(seconds), command], {
    encoding: 'utf8',
    timeout: 60_000,
  })
  return { ...r, ms: performance.now() - t0 }
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

test('a leftover process holding the pipes does not hold the run', () => {
  // The command starts a detached child that keeps its stdout, then exits 0.
  const child = join(dir, 'child.mjs')
  writeFileSync(child, 'setTimeout(() => {}, 60_000)')
  const parent = node(
    'parent',
    `import { spawn } from 'node:child_process'
const c = spawn(${JSON.stringify(process.execPath)}, [${JSON.stringify(child)}], { detached: true, stdio: 'inherit' })
c.unref()
console.log(String(c.pid))`,
  )
  const r = run(30, parent)
  assert.equal(r.status, 0)
  assert.ok(r.ms < EXIT_GRACE_MS + 10_000, `took ${r.ms}ms`)
  const pid = Number(r.stdout.trim())
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // already gone
  }
})
