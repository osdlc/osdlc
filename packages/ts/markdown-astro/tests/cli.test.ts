/**
 * The `markdown-astro` program as a user runs it: the built `bin/markdown-astro.js` under
 * Node (tests/global-setup.ts builds `dist/` first), so the exit code is the one `runMain` sets
 * and the output is what reaches the terminal. A scratch config dir and no `MARKDOWN_ASTRO_HOME` keep a machine-wide
 * `markdown-astro dev link` from handing the run to another checkout.
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
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

describe('markdown-astro cli arguments', () => {
  test.each([
    [['transform', '--dry-run'], /unknown option --dry-run/],
    [['transform', '--clena'], /unknown option --clena/],
    [['check', '-c'], /-c needs a value/],
    [['check', '--vault'], /--vault needs a value/],
    [['check', 'extra'], /unexpected argument extra/],
  ])('%j is rejected before anything runs', (argv, message) => {
    const r = run(...argv)
    expect(r.code).toBe(1)
    expect(r.err).toMatch(message)
  })

  test('an unknown command is named even without a config file', () => {
    const r = run('trnasform', '-c', join(CONFIG, 'missing.yaml'))
    expect(r.code).toBe(1)
    expect(r.err).toContain('Unknown command: trnasform')
  })
})

describe('markdown-astro check', () => {
  function site(note: string, asset: boolean): string {
    const root = mkdtempSync(join(tmpdir(), 'markdown-astro-check-'))
    mkdirSync(join(root, 'vault', 'Notes'), { recursive: true })
    mkdirSync(join(root, 'vault', '_attachments'), { recursive: true })
    writeFileSync(join(root, 'vault', 'Notes', 'a.md'), note)
    if (asset) writeFileSync(join(root, 'vault', '_attachments', 'pic.png'), 'x')
    writeFileSync(
      join(root, 'markdown-astro.config.yaml'),
      'vault: vault\nfrontmatterAssets: [cover]\nassets:\n  publicDir: public/_media\n  publicBase: /_media\n  vaultDir: _attachments\ncollections:\n  - name: notes\n    vaultDir: Notes\n    contentDir: src/content/notes\n',
    )
    return join(root, 'markdown-astro.config.yaml')
  }

  test('exits 1 and names the missing assets', () => {
    const r = run('check', '-q', '-c', site('![[gone.png]]\n', false))
    expect(r.code).toBe(1)
    expect(r.err).toContain('missing assets (1): gone.png')
  })

  test('a missing frontmatter asset fails too', () => {
    const r = run('check', '-q', '-c', site('---\ncover: gone.png\n---\nbody\n', false))
    expect(r.code).toBe(1)
  })

  test('exits 0 when every asset exists', () => {
    const r = run('check', '-q', '-c', site('![[pic.png]]\n', true))
    expect(r.code).toBe(0)
  })
})
