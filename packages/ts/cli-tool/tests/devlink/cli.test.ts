import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { rmSync } from 'node:fs'
import { join } from 'node:path'

import { runDevCli, type CliIo } from '../../src/devlink/cli.ts'
import { readActive } from '../../src/devlink/state.ts'
import { SHA_A, SPEC, sandbox, seedCheckout, seedGit, type Sandbox } from './support.ts'

let sb: Sandbox
beforeEach(() => {
  sb = sandbox()
})
afterEach(() => sb.dispose())

function capture(): CliIo & { out: string; err: string } {
  const io = {
    out: '',
    err: '',
    stdout(t: string) {
      io.out += t
    },
    stderr(t: string) {
      io.err += t
    },
  }
  return io
}

const base = () => ({
  dirs: sb.dirs,
  env: {} as Record<string, string | undefined>,
  cwd: sb.root,
})

describe('runDevCli option values', () => {
  test.each([
    [['install', '--bin-dir']],
    [['install', '--bin-dir=']],
    [['install', '--bin-dir', '--json']],
    [['link', '--label']],
    [['link', '--label=']],
    [['link', '--label', '--json']],
  ])('%p is a usage error, not a silent default', (argv) => {
    const io = capture()
    expect(runDevCli(SPEC, argv, { ...base(), io })).toBe(2)
    expect(io.err).toMatch(/needs a non-empty value/)
    expect(io.out).toBe('')
  })
})

describe('runDevCli', () => {
  test('no verb prints usage and exits 2; --help exits 0', () => {
    const io = capture()
    expect(runDevCli(SPEC, [], { ...base(), io })).toBe(2)
    expect(io.out).toContain('usage: tooly dev')
    const io2 = capture()
    expect(runDevCli(SPEC, ['--help'], { ...base(), io: io2 })).toBe(0)
  })

  test('unknown verb / option exit 2', () => {
    const io = capture()
    expect(runDevCli(SPEC, ['bogus'], { ...base(), io })).toBe(2)
    expect(io.err).toContain("unknown verb 'bogus'")
    expect(runDevCli(SPEC, ['status', '--nope'], { ...base(), io: capture() })).toBe(2)
  })

  test('status shows the cwd line only for a spec with the cwd layer', () => {
    let io = capture()
    expect(runDevCli(SPEC, ['status'], { ...base(), io })).toBe(0)
    expect(io.out).toContain('  cwd:')
    io = capture()
    expect(runDevCli({ ...SPEC, cwdLayer: false }, ['status'], { ...base(), io })).toBe(0)
    expect(io.out).not.toContain('cwd:')
  })

  test('link → status → history → use #2 → off, text and --json', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    const b = seedCheckout(join(sb.root, 'b'))
    let io = capture()
    expect(runDevCli(SPEC, ['link', a], { ...base(), io })).toBe(0)
    expect(io.out).toContain(`tooly now runs ${a}/src/cli.ts`)

    io = capture()
    expect(runDevCli(SPEC, ['link', b, '--label', 'second'], { ...base(), io })).toBe(0)

    io = capture()
    expect(runDevCli(SPEC, ['status'], { ...base(), io })).toBe(0)
    expect(io.out).toContain(`active: link → ${b}/src/cli.ts`)

    io = capture()
    expect(runDevCli(SPEC, ['history', '--json'], { ...base(), io })).toBe(0)
    const rows = JSON.parse(io.out) as Array<{ checkout: string; label: string | null }>
    expect(rows.map((r) => r.checkout)).toEqual([b, a])
    expect(rows[0]?.label).toBe('second')

    io = capture()
    expect(runDevCli(SPEC, ['use', '#2'], { ...base(), io })).toBe(0)
    expect(readActive(SPEC, { dirs: sb.dirs })).toBe(a)

    io = capture()
    expect(runDevCli(SPEC, ['off'], { ...base(), io })).toBe(0)
    expect(io.out).toContain(`unlinked ${a}`)
    expect(readActive(SPEC, { dirs: sb.dirs })).toBeNull()
  })

  test('history text: the active mark, branch and head, and missing and label flags', () => {
    // A temp path may hold regex metacharacters.
    const re = (path: string) => path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    let io = capture()
    expect(runDevCli(SPEC, ['history'], { ...base(), io })).toBe(0)
    expect(io.out).toBe('no checkouts have been linked yet.\n')

    const a = seedCheckout(join(sb.root, 'a'))
    seedGit(a, 'main', SHA_A)
    const b = seedCheckout(join(sb.root, 'b'))
    const c = seedCheckout(join(sb.root, 'c'))
    expect(runDevCli(SPEC, ['link', a], { ...base(), io: capture() })).toBe(0)
    expect(runDevCli(SPEC, ['link', c], { ...base(), io: capture() })).toBe(0)
    expect(runDevCli(SPEC, ['link', b, '--label', 'second'], { ...base(), io: capture() })).toBe(0)
    rmSync(c, { recursive: true, force: true })

    io = capture()
    expect(runDevCli(SPEC, ['history'], { ...base(), io })).toBe(0)
    const lines = io.out.split('\n')
    expect(lines[0]).toMatch(new RegExp(`^\\* #1  ${re(b)}  link \\S+  \\(second\\)$`))
    expect(lines[1]).toMatch(new RegExp(`^  #2  ${re(c)}  link \\S+  \\(missing\\)$`))
    expect(lines[2]).toMatch(
      new RegExp(`^  #3  ${re(a)}  \\[main @ ${SHA_A.slice(0, 12)}\\]  link \\S+$`),
    )
    expect(io.out).toContain("\n\n* = active. 'dev use #N' switches;")
  })

  test('use with no target is a usage error; off with nothing linked says so', () => {
    let io = capture()
    expect(runDevCli(SPEC, ['use'], { ...base(), io })).toBe(2)
    expect(io.err).toBe("tooly dev use: expected #N, a path, or 'canonical'\n")
    expect(io.out).toBe('')
    io = capture()
    expect(runDevCli(SPEC, ['off'], { ...base(), io })).toBe(0)
    expect(io.out).toBe('no checkout was linked; tooly already runs the local install.\n')
  })

  test('the help names the resolution variables', () => {
    const io = capture()
    expect(runDevCli(SPEC, ['--help'], { ...base(), io })).toBe(0)
    expect(io.out).toContain(
      '$TOOLY_HOME, a checkout above the\ncwd ($TOOLY_CWD_DEV=0 turns that off)',
    )
    const plain = capture()
    runDevCli({ ...SPEC, cwdLayer: false }, ['--help'], { ...base(), io: plain })
    expect(plain.out).toContain('$TOOLY_HOME, the linked checkout, the\nlocal install.')
  })

  test('a DevlinkError is exit 1 with the message on stderr', () => {
    const io = capture()
    expect(runDevCli(SPEC, ['use', '#9'], { ...base(), io })).toBe(1)
    expect(io.err).toContain('history is empty')
  })

  test('--dry-run reports and writes nothing', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    const io = capture()
    expect(runDevCli(SPEC, ['link', a, '--dry-run'], { ...base(), io })).toBe(0)
    expect(io.out).toContain('dry-run')
    expect(readActive(SPEC, { dirs: sb.dirs })).toBeNull()
  })

  test('install needs a checkout: self, or a path', () => {
    const a = seedCheckout(join(sb.root, 'a'))
    const bin = join(sb.root, 'bin')
    let io = capture()
    expect(runDevCli(SPEC, ['install', '--bin-dir', bin], { ...base(), io })).toBe(2)
    io = capture()
    expect(runDevCli(SPEC, ['install', '--bin-dir', bin], { ...base(), io, self: a })).toBe(0)
    expect(io.out).toContain(`${bin}/tooly →`)
    expect(io.out).toContain('not on your PATH')
  })
})

describe('runDevCli on Windows', () => {
  test('reports itself unavailable and exits 1, writing nothing', () => {
    const io = capture()
    expect(runDevCli(SPEC, ['status'], { ...base(), io, platform: 'win32' })).toBe(1)
    expect(io.out).toBe('')
    expect(io.err).toBe(
      'tooly dev: not available on Windows; the launcher is a POSIX shell script\n',
    )
  })

  test('runs elsewhere', () => {
    const io = capture()
    expect(runDevCli(SPEC, ['status', '--json'], { ...base(), io, platform: 'linux' })).toBe(0)
  })
})
