/**
 * Starting a `.cmd` or `.bat` file on Windows: the `cmd.exe` quoting as a
 * pure function, the spawn plan with `platform: 'win32'` on any OS, and a
 * real spawn on Windows hosts.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, test } from 'vitest'

import { classifyFailure, spawnRunner, spawnRunnerAsync } from '../src/index.ts'
import { cmdArg, cmdCommand } from '../src/quote.ts'
import { spawnPlan } from '../src/spawn-plan.ts'

/** What `cmd.exe` does to a line with no quoted sections: each `^x` becomes `x`. */
function cmdUnescape(line: string): string {
  return line.replace(/\^(.)/gs, '$1')
}

/** One argument split by the Microsoft C runtime rules. */
function msvcrtArg(text: string): string {
  let out = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    let slashes = 0
    while (text[i] === '\\') {
      slashes++
      i++
    }
    if (text[i] === '"') {
      out += '\\'.repeat(Math.floor(slashes / 2))
      if (slashes % 2 === 1) out += '"'
      else quoted = !quoted
      continue
    }
    out += '\\'.repeat(slashes)
    if (i < text.length) {
      if (!quoted && (text[i] === ' ' || text[i] === '\t')) throw new Error('split')
      out += text[i]
    }
  }
  return out
}

const HOSTILE = [
  '',
  'plain',
  'two words',
  ' lead and trail ',
  'tab\there',
  'say "hi"',
  '"',
  '""',
  'trailing\\',
  'trailing\\\\',
  'C:\\Program Files\\x\\',
  'slash\\"quote',
  'a&b|c<d>e',
  'caret^',
  '%PATH%',
  '%%',
  '50%',
  '!PATH!',
  '(group)',
  '[x],y;z=1',
  '`back`',
  'glob*?',
  'unicode héllo ✓ 中文',
  '--flag=a b',
  '^"&^"',
]

describe('cmdArg', () => {
  test('quotes by the C runtime rules, then escapes every cmd.exe special character', () => {
    expect(cmdArg('a')).toBe('^"a^"')
    expect(cmdArg('')).toBe('^"^"')
    expect(cmdArg('a b')).toBe('^"a^ b^"')
    expect(cmdArg('say "hi"')).toBe('^"say^ \\^"hi\\^"^"')
    expect(cmdArg('dir\\')).toBe('^"dir\\\\^"')
    expect(cmdArg('a\\"b')).toBe('^"a\\\\\\^"b^"')
    expect(cmdArg('%PATH%')).toBe('^"^%PATH^%^"')
    expect(cmdArg('!x!')).toBe('^"^!x^!^"')
    expect(cmdArg('a&b|c<d>e^f')).toBe('^"a^&b^|c^<d^>e^^f^"')
    expect(cmdArg('(x)')).toBe('^"^(x^)^"')
    expect(cmdArg('héllo ✓')).toBe('^"héllo^ ✓^"')
  })

  test('the double escape survives a second cmd.exe pass', () => {
    expect(cmdArg('a&b', true)).toBe('^^^"a^^^&b^^^"')
  })

  test.each(HOSTILE)('%j reaches the program unchanged', (arg) => {
    expect(msvcrtArg(cmdUnescape(cmdArg(arg)))).toBe(arg)
    expect(msvcrtArg(cmdUnescape(cmdUnescape(cmdArg(arg, true))))).toBe(arg)
  })

  test.each(HOSTILE)('%j leaves no unescaped cmd.exe special character', (arg) => {
    // Remove each escaped pair; what is left must hold none of them.
    expect(cmdArg(arg).replace(/\^./gs, '')).not.toMatch(/[()[\]%!^"`<>&|;, *?]/)
  })

  test('cmdCommand escapes without quoting', () => {
    expect(cmdCommand('C:\\Program Files\\nodejs\\npm.cmd')).toBe(
      'C:\\Program^ Files\\nodejs\\npm.cmd',
    )
  })
})

const root = realpathSync(mkdtempSync(join(tmpdir(), 'seam-plan-')))
afterAll(() => rmSync(root, { recursive: true, force: true }))

function file(rel: string, body = ''): string {
  const p = join(root, rel)
  mkdirSync(join(p, '..'), { recursive: true })
  writeFileSync(p, body)
  return p
}

const shim = file('node_modules/.bin/tsc.CMD')
const bat = file('bin/build.BAT')
const exe = file('bin/git.EXE')
const env = { PATH: `${join(root, 'node_modules', '.bin')};${join(root, 'bin')}` }
const win = { cwd: root, env, platform: 'win32', comspec: 'cmd.exe' } as const

describe('spawnPlan', () => {
  test('POSIX passes the binary and argv through unchanged', () => {
    expect(spawnPlan('git', ['a b', '%x%'], { cwd: root, platform: 'linux' })).toEqual({
      file: 'git',
      args: ['a b', '%x%'],
    })
  })

  test('win32 spawns an .exe by its resolved path, argv unchanged', () => {
    expect(spawnPlan('git', ['status', 'a b'], win)).toEqual({
      file: exe,
      args: ['status', 'a b'],
    })
  })

  test('win32 runs a .bat through cmd.exe with one escape', () => {
    expect(spawnPlan('build', ['a&b', ''], win)).toEqual({
      file: 'cmd.exe',
      args: ['/d', '/s', '/c', `"${cmdCommand(bat)} ^"a^&b^" ^"^""`],
      windowsVerbatimArguments: true,
    })
  })

  test('win32 escapes twice for a node_modules/.bin shim', () => {
    expect(spawnPlan('tsc', ['-p', 'x&y'], win)).toEqual({
      file: 'cmd.exe',
      args: [
        '/d',
        '/s',
        '/c',
        `"${cmdCommand(shim)} ${cmdArg('-p', true)} ${cmdArg('x&y', true)}"`,
      ],
      windowsVerbatimArguments: true,
    })
  })

  test('win32 leaves a binary it cannot find as given, so the spawn reports ENOENT', () => {
    expect(spawnPlan('nope', ['x'], win)).toEqual({ file: 'nope', args: ['x'] })
  })

  test('win32 refuses a line break in an argument to a batch file', () => {
    const plan = spawnPlan('build', ['ok', 'a\nb'], win)
    expect(plan).toEqual({ refusal: expect.stringContaining('argv[1] holds a line break') })
    // An .exe gets argv directly, so a line break is fine there.
    expect(spawnPlan('git', ['a\nb'], win)).toEqual({ file: exe, args: ['a\nb'] })
  })
})

describe('runners on this host', () => {
  test('a missing binary is still classified not-installed', async () => {
    const sync = spawnRunner('seam-no-such-binary').run([], { cwd: root })
    expect(classifyFailure(sync)?.kind).toBe('not-installed')
    const later = await spawnRunnerAsync('seam-no-such-binary').run([], { cwd: root })
    expect(classifyFailure(later)?.kind).toBe('not-installed')
  })
})

describe.skipIf(process.platform !== 'win32')('a real .cmd shim (Windows hosts only)', () => {
  const script = file('echo-args.js', 'console.log(JSON.stringify(process.argv.slice(2)))\n')
  const npmShim = file('real/node_modules/.bin/echo-args.cmd', `@node "${script}" %*\r\n`)
  test('every hostile argument reaches node unchanged', async () => {
    const sync = spawnRunner(npmShim).run(HOSTILE, { cwd: root })
    expect(sync.error).toBeUndefined()
    expect(JSON.parse(sync.stdout)).toEqual(HOSTILE)
    const later = await spawnRunnerAsync(npmShim).run(HOSTILE, { cwd: root })
    expect(JSON.parse(later.stdout)).toEqual(HOSTILE)
  })

  test('a line break is refused as a spawn failure', () => {
    const r = spawnRunner(npmShim).run(['a\nb'], { cwd: root })
    expect(r).toMatchObject({ neverExited: true, reason: 'spawn' })
    expect(classifyFailure(r)?.kind).toBe('spawn')
  })
})
