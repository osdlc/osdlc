import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { afterEach, beforeEach, expect, test } from 'vitest'

/**
 * Node.js and Rust holders of one lock file. The Rust crate
 * `osdlc-file-lock`'s `interop-counter` example bumps a counter under the lock
 * just as `section.child.ts` does, and none of the bumps may be lost. Build the
 * example first, or point FILE_LOCK_RUST_COUNTER at it:
 *
 *   cargo build --manifest-path packages/rust/Cargo.toml -p osdlc-file-lock --example interop-counter
 *
 * Without it the test is skipped; the conformance suite still holds both
 * implementations to one protocol.
 */

const run = promisify(execFile)
const CHILD = join(import.meta.dirname, 'section.child.ts')
const RUST =
  process.env['FILE_LOCK_RUST_COUNTER'] ??
  join(import.meta.dirname, '../../../rust/target/debug/examples/interop-counter')

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'file-lock-interop-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

test.skipIf(!existsSync(RUST))(
  'Node.js and Rust processes bumping one counter under one lock lose no update',
  async () => {
    const counter = join(dir, 'counter')
    writeFileSync(counter, '0')
    const node = () => run(process.execPath, [CHILD, counter, '10'], { timeout: 55_000 })
    const rust = () => run(RUST, [counter, `${counter}.lock`, '10'], { timeout: 55_000 })
    await Promise.all([node(), rust(), node(), rust(), node(), rust()])
    expect(readFileSync(counter, 'utf-8')).toBe('60')
    expect(readdirSync(dir)).toEqual(['counter'])
  },
  60_000,
)
