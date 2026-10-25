import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { devNull } from 'node:os'
import { join } from 'node:path'

import { execSelection } from '../../src/devlink/exec.ts'
import type { Selected } from '../../src/devlink/resolve.ts'
import { SPEC, sandbox, type Sandbox } from './support.ts'

let sb: Sandbox
beforeEach(() => {
  sb = sandbox()
})
afterEach(() => sb.dispose())

const selection: Selected = {
  source: 'env',
  checkout: '/x',
  entry: '/x/src/cli.ts',
  reason: 'test',
}

function fakeBun(body: string): string {
  const path = join(sb.root, 'bun')
  writeFileSync(path, `#!/bin/sh\n${body}\n`)
  chmodSync(path, 0o755)
  return path
}

describe('execSelection exit codes', () => {
  test('a signalled child returns 128 plus the signal number', () => {
    const bun = fakeBun('kill -TERM $$')
    expect(execSelection(SPEC, selection, [], { env: { TOOLY_QUIET: '1' }, bun })).toBe(143)
  })

  test('a normal exit code passes through', () => {
    const bun = fakeBun('exit 7')
    expect(execSelection(SPEC, selection, [], { env: { TOOLY_QUIET: '1' }, bun })).toBe(7)
  })
})

describe('execSelection keeps Bun off the cwd', () => {
  test('bun gets --no-env-file and an empty --config, before run', () => {
    const args = join(sb.root, 'args')
    const bun = fakeBun(`printf '%s\\n' "$@" > "${args}"`)
    expect(execSelection(SPEC, selection, ['x'], { env: { TOOLY_QUIET: '1' }, bun })).toBe(0)
    expect(readFileSync(args, 'utf-8').trim().split('\n')).toEqual([
      '--no-env-file',
      `--config=${devNull}`,
      'run',
      '/x/src/cli.ts',
      'x',
    ])
  })

  const hasBun = spawnSync('bun', ['--version']).status === 0

  // Bun reads `.env` and `bunfig.toml` from the cwd, and a `preload` there
  // runs before the entry. The cwd is a repository the user stands in.
  test.skipIf(!hasBun)('a real bun reads neither the .env nor the bunfig.toml of the cwd', () => {
    const repo = join(sb.root, 'repo')
    const checkout = join(sb.root, 'checkout')
    mkdirSync(repo)
    mkdirSync(join(checkout, 'src'), { recursive: true })
    writeFileSync(join(repo, '.env'), 'FROM_REPO=yes\n')
    writeFileSync(join(repo, 'bunfig.toml'), 'preload = ["./pre.ts"]\n')
    writeFileSync(
      join(repo, 'pre.ts'),
      `require('node:fs').writeFileSync(${JSON.stringify(join(repo, 'PRELOAD_RAN'))}, '1')\n`,
    )
    const report = join(sb.root, 'report')
    writeFileSync(
      join(checkout, 'src', 'cli.ts'),
      `require('node:fs').writeFileSync(${JSON.stringify(report)}, String(process.env.FROM_REPO))\n`,
    )
    const saved = process.cwd()
    process.chdir(repo)
    try {
      const code = execSelection(
        SPEC,
        { ...selection, checkout, entry: join(checkout, 'src', 'cli.ts') },
        [],
        { env: { PATH: process.env['PATH'], TOOLY_QUIET: '1' } },
      )
      expect(code).toBe(0)
    } finally {
      process.chdir(saved)
    }
    expect(readFileSync(report, 'utf-8')).toBe('undefined')
    expect(existsSync(join(repo, 'PRELOAD_RAN'))).toBe(false)
  })
})
