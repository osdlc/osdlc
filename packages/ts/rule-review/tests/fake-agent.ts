/**
 * A stand-in `claude` on PATH, so a test can run the whole path, process spawn
 * included, without a model.
 */
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Write a `claude` that runs `script` (sh) into a new directory, and return
 * the directory, for PATH. `$DIR` in the script is that directory.
 */
export function fakeAgent(script: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'rule-review-fake-claude-'))
  writeFileSync(join(dir, 'claude'), `#!/bin/sh\nDIR='${dir}'\n${script}\n`)
  chmodSync(join(dir, 'claude'), 0o755)
  return dir
}

/** A `claude` that answers every judgement with `findings`, in the CLI's JSON envelope. */
export function fakeClaude(findings: readonly object[]): string {
  const envelope = {
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: JSON.stringify({ findings }),
    structured_output: { findings },
  }
  const dir = fakeAgent('cat "$DIR/envelope.json"')
  writeFileSync(join(dir, 'envelope.json'), JSON.stringify(envelope))
  return dir
}

/** Run `fn` with `dir` first on PATH. */
export async function withPath<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const path = process.env['PATH']
  process.env['PATH'] = `${dir}:${path ?? ''}`
  try {
    return await fn()
  } finally {
    process.env['PATH'] = path
  }
}
