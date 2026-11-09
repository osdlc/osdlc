/**
 * `config set` and `unset` write with a compare-and-swap. The mock makes an
 * editor save the file while the edit is being made, between the read and
 * the write, which no real timing can do reliably.
 */

import { afterAll, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const editor = vi.hoisted(() => ({ save: null as null | (() => void) }))

vi.mock('@osdlc/config-layers', async (importOriginal) => {
  const real = await importOriginal<typeof import('@osdlc/config-layers')>()
  const during =
    <A extends unknown[]>(edit: (...args: A) => string) =>
    (...args: A): string => {
      const out = edit(...args)
      editor.save?.()
      return out
    }
  return { ...real, setPath: during(real.setPath), unsetPath: during(real.unsetPath) }
})

const { EXIT, captureContext } = await import('@osdlc/cli-tool')
const { PR_UPDATE_CONFIG_FILE, main } = await import('../src/cli.ts')
const { fakeTools } = await import('./support.ts')

const scratch = mkdtempSync(join(tmpdir(), 'pr-update-config-cas-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

let n = 0
function project(text: string | null): { dir: string; file: string } {
  const dir = mkdtempSync(join(scratch, `p${n++}-`))
  const file = join(dir, PR_UPDATE_CONFIG_FILE.name)
  if (text !== null) writeFileSync(file, text)
  return { dir, file }
}

async function run(dir: string, ...argv: string[]) {
  const ctx = captureContext({ cwd: dir, env: { PATH: process.env.PATH ?? '' } })
  const code = await main(argv, ctx, fakeTools)
  return { code, err: ctx.io.err }
}

/** Run `argv` while the editor saves `saved` over `file` mid-edit. */
async function runDuringSave(dir: string, file: string, saved: string, ...argv: string[]) {
  editor.save = () => writeFileSync(file, saved)
  try {
    return await run(dir, ...argv)
  } finally {
    editor.save = null
  }
}

describe('a file saved while config set or unset edits it', () => {
  test('set leaves the saved file as it is and fails with config-conflict', async () => {
    const { dir, file } = project('# mine\npr_update:\n  strategy: rebase\n')
    const saved = '# saved in an editor\npr_update:\n  strategy: squash\n'
    const r = await runDuringSave(dir, file, saved, 'config', 'set', 'strategy', 'merge')
    expect(r.code).toBe(EXIT.error)
    expect(r.err).toContain('changed while the edit was made; it was left as it is')
    expect(readFileSync(file, 'utf8')).toBe(saved)
  })

  test('unset does the same', async () => {
    const { dir, file } = project('pr_update:\n  strategy: merge\n')
    const saved = 'pr_update:\n  strategy: squash\n'
    const r = await runDuringSave(dir, file, saved, 'config', 'unset', 'strategy')
    expect(r.code).toBe(EXIT.error)
    expect(r.err).toContain('changed while the edit was made')
    expect(readFileSync(file, 'utf8')).toBe(saved)
  })

  test('a file created while set creates it is not overwritten', async () => {
    const { dir, file } = project(null)
    const saved = 'pr_update:\n  strategy: squash\n'
    const r = await runDuringSave(dir, file, saved, 'config', 'set', 'strategy', 'merge')
    expect(r.code).toBe(EXIT.error)
    expect(r.err).toContain('changed while the edit was made')
    expect(readFileSync(file, 'utf8')).toBe(saved)
  })

  test('with no edit in between, set writes and keeps the comments', async () => {
    const { dir, file } = project('# mine\npr_update:\n  strategy: rebase\n')
    expect((await run(dir, 'config', 'set', 'strategy', 'merge')).code).toBe(EXIT.ok)
    expect(readFileSync(file, 'utf8')).toBe('# mine\npr_update:\n  strategy: merge\n')
  })
})
