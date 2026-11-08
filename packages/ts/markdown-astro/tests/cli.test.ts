/**
 * The `markdown-astro` program as a user runs it: the built `bin/markdown-astro.js` under
 * Node (tests/global-setup.ts builds `dist/` first), so the exit code is the one `runMain` sets
 * and the output is what reaches the terminal. A scratch config dir and no `MARKDOWN_ASTRO_HOME` keep a machine-wide
 * `markdown-astro dev link` from handing the run to another checkout.
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

const CLI = fileURLToPath(new URL('../bin/markdown-astro.js', import.meta.url))
const CONFIG = mkdtempSync(join(tmpdir(), 'markdown-astro-cli-'))

function run(...argv: string[]): { code: number | null; out: string; err: string } {
  const env: NodeJS.ProcessEnv = { ...process.env, MARKDOWN_ASTRO_CONFIG_DIR: CONFIG }
  delete env['MARKDOWN_ASTRO_HOME']
  const r = spawnSync(process.execPath, [CLI, ...argv], { encoding: 'utf8', env, timeout: 30_000 })
  return { code: r.status, out: r.stdout, err: r.stderr }
}

describe('markdown-astro cli', () => {
  test('--help prints usage and exits 0', () => {
    const r = run('--help')
    expect(r.code).toBe(0)
    expect(r.out).toContain('Usage:')
  })

  test('no command prints usage and exits 1', () => {
    const r = run('--clean')
    expect(r.code).toBe(1)
    expect(r.out).toContain('Usage:')
  })

  test('a thrown error prints one line naming the tool and exits 1', () => {
    const r = run('check', '-c', join(CONFIG, 'missing.yaml'))
    expect(r.code).toBe(1)
    expect(r.err).toMatch(/^markdown-astro: ENOENT/)
    expect(r.err.trim().split('\n')).toHaveLength(1)
  })
})
