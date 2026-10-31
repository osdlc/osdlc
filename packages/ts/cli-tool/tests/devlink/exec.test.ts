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
    expect(
      execSelection(SPEC, selection, [], { env: { TOOLY_QUIET: '1' }, bun, execve: undefined }),
    ).toBe(143)
  })

  test('a normal exit code passes through', () => {
    const bun = fakeBun('exit 7')
    expect(
      execSelection(SPEC, selection, [], { env: { TOOLY_QUIET: '1' }, bun, execve: undefined }),
    ).toBe(7)
  })

  test('a bun that cannot start returns 1 and says so after the running line', () => {
    const missing = join(sb.root, 'no-such-bun')
    const notExecutable = join(sb.root, 'plain-bun')
    writeFileSync(notExecutable, '#!/bin/sh\nexit 0\n', { mode: 0o644 })
    for (const bun of [missing, notExecutable]) {
      const lines: string[] = []
      const code = execSelection(SPEC, selection, [], {
        env: {},
        bun,
        execve: undefined,
        announce: (line) => lines.push(line),
      })
      expect(code).toBe(1)
      expect(lines).toHaveLength(2)
      expect(lines[0]).toBe('tooly: running /x/src/cli.ts (test)')
      expect(lines[1]).toContain(`could not start ${bun}`)
      expect(lines[1]).toContain("run 'tooly dev off'")
    }
  })
})

describe('execSelection finds bun on absolute PATH entries only', () => {
  test('a bun on a relative PATH entry never runs', () => {
    const repo = join(sb.root, 'repo')
    mkdirSync(join(repo, 'bin'), { recursive: true })
    const ran = join(sb.root, 'REPO_RAN')
    writeFileSync(join(repo, 'bin', 'bun'), `#!/bin/sh\ntouch "${ran}"\n`)
    chmodSync(join(repo, 'bin', 'bun'), 0o755)
    const lines: string[] = []
    const saved = process.cwd()
    process.chdir(repo)
    try {
      const code = execSelection(SPEC, selection, [], {
        env: { PATH: 'bin:.', TOOLY_QUIET: '1' },
        execve: undefined,
        announce: (line) => lines.push(line),
      })
      expect(code).toBe(1)
    } finally {
      process.chdir(saved)
    }
    expect(existsSync(ran)).toBe(false)
    expect(lines.join('\n')).toContain('needs bun on an absolute PATH entry')
  })

  test('a bun on an absolute PATH entry runs by its absolute path', () => {
    const report = join(sb.root, 'report')
    fakeBun(`printf '%s' "$0" > "${report}"`)
    const code = execSelection(SPEC, selection, [], {
      env: { PATH: `bin:${sb.root}`, TOOLY_QUIET: '1' },
      execve: undefined,
    })
    expect(code).toBe(0)
    expect(readFileSync(report, 'utf-8')).toBe(join(sb.root, 'bun'))
  })
})

describe('execSelection keeps Bun off the cwd', () => {
  test('bun gets --no-env-file and an empty --config, before run', () => {
    const args = join(sb.root, 'args')
    const bun = fakeBun(`printf '%s\\n' "$@" > "${args}"`)
    expect(
      execSelection(SPEC, selection, ['x'], { env: { TOOLY_QUIET: '1' }, bun, execve: undefined }),
    ).toBe(0)
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
        { env: { PATH: process.env['PATH'], TOOLY_QUIET: '1' }, execve: undefined },
      )
      expect(code).toBe(0)
    } finally {
      process.chdir(saved)
    }
    expect(readFileSync(report, 'utf-8')).toBe('undefined')
    expect(existsSync(join(repo, 'PRELOAD_RAN'))).toBe(false)
  })
})
