/**
 * A stand-in `claude` on PATH that answers every judgement with fixed findings,
 * in the JSON envelope the real CLI prints, so a test can run the whole path,
 * process spawn included, without a model.
 */
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Write the fake into a new directory and return that directory, for PATH. */
export function fakeClaude(findings: readonly object[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'rule-review-fake-claude-'))
  const envelope = {
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: JSON.stringify({ findings }),
    structured_output: { findings },
  }
  writeFileSync(join(dir, 'envelope.json'), JSON.stringify(envelope))
  writeFileSync(join(dir, 'claude'), `#!/bin/sh\ncat "${join(dir, 'envelope.json')}"\n`)
  chmodSync(join(dir, 'claude'), 0o755)
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
