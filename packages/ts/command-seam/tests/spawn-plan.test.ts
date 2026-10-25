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
import { spawnFailure } from '../src/sync.ts'

/** Variables set while the model parses, so a `%NAME%` that expands is caught. */
const SET = { PATH: 'C:\\Windows', VAR: 'expanded' }

/**
 * One `cmd.exe` parse of `line`, as a model. With `percent`, `%NAME%` expands
 * first when NAME is set (the `cmd /c` line; a `%*` substitution is not
 * scanned again). Then, outside a quoted section, `^x` becomes `x`, and an
 * unescaped `&`, `|`, `<` or `>` is a command operator. A `"` opens or closes
 * a quoted section, where `^` is literal.
 */
function cmdParse(line: string, percent: boolean): { text: string; operator: boolean } {
  const expanded = percent
    ? line.replace(/%([^%]+)%/g, (m, name: string) => SET[name as keyof typeof SET] ?? m)
    : line
  let text = ''
  let quoted = false
  let operator = false
  for (let i = 0; i < expanded.length; i++) {
    const c = expanded[i] as string
    if (c === '"') quoted = !quoted
    else if (!quoted && c === '^') {
      i++
      if (i < expanded.length) text += expanded[i]
      continue
    } else if (!quoted && /[&|<>]/.test(c)) operator = true
    text += c
  }
  return { text, operator }
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
  '"&calc',
  'x"&calc&"',
  '\\"&calc',
  '%VAR%',
  '"%VAR%"',
  '^%VAR^%',
  '^',
  '^^',
  'a|b',
  '"|"',
  '<in >out',
  '"<>"',
  'end\\',
  'end\\\\\\',
  '"quoted\\"',
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

  test.each(HOSTILE)('%j, escaped once, reaches a program cmd.exe starts unchanged', (arg) => {
    const first = cmdParse(cmdArg(arg), true)
    expect(first.operator).toBe(false)
    expect(msvcrtArg(first.text)).toBe(arg)
  })

  test.each(HOSTILE)('%j, escaped twice, survives a batch file passing it on with %%*', (arg) => {
    // The `cmd /c` line, then the batch file's line after `%*` is substituted.
    const first = cmdParse(cmdArg(arg, true), true)
    expect(first.operator).toBe(false)
    const second = cmdParse(first.text, false)
    expect(second.operator).toBe(false)
    expect(msvcrtArg(second.text)).toBe(arg)
  })

  test('one escape is not enough for a batch file that passes %* on', () => {
    // The model must catch the attack the double escape stops.
    const first = cmdParse(cmdArg('"&calc'), true)
    expect(cmdParse(first.text, false).operator).toBe(true)
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
const globalNpm = file('AppData/Roaming/npm/pnpm.CMD')
const env = {
  PATH: [
    join(root, 'node_modules', '.bin'),
    join(root, 'bin'),
    join(root, 'AppData', 'Roaming', 'npm'),
  ].join(';'),
}
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

  test.each([
    ['a .bat', 'build', bat],
    ['a node_modules/.bin shim', 'tsc', shim],
    ['a global npm shim', 'pnpm', globalNpm],
  ])('win32 runs %s through cmd.exe, escaping twice', (_, name, path) => {
    expect(spawnPlan(name, ['-p', 'x&y', ''], win)).toEqual({
      file: 'cmd.exe',
      args: [
        '/d',
        '/v:off',
        '/s',
        '/c',
        `"${cmdCommand(path)} ${cmdArg('-p', true)} ${cmdArg('x&y', true)} ${cmdArg('', true)}"`,
      ],
      windowsVerbatimArguments: true,
    })
  })

  test('win32 refuses a binary it cannot find, so the current folder is never searched', () => {
    file('nope.exe')
    const plan = spawnPlan('nope', ['x'], win)
    expect(plan).toEqual({ refusal: 'spawn nope ENOENT' })
    expect(classifyFailure(spawnFailure('spawn nope ENOENT'))?.kind).toBe('not-installed')
  })

  test('win32 refuses a line break in an argument to a batch file', () => {
    const plan = spawnPlan('build', ['ok', 'a\nb'], win)
    expect(plan).toEqual({ refusal: expect.stringContaining('argv[1] holds a line break') })
    // An .exe gets argv directly, so a line break is fine there.
    expect(spawnPlan('git', ['a\nb'], win)).toEqual({ file: exe, args: ['a\nb'] })
  })

  test.each(['%PATH%', '%NAME:a=b%', '%NAME:~1,2%', 'a%b'])(
    'win32 refuses %j in an argument to a batch file',
    (arg) => {
      const plan = spawnPlan('build', ['ok', arg], win)
      expect(plan).toEqual({ refusal: expect.stringContaining('argv[1] holds a %') })
      // An .exe gets argv directly, so a % is fine there.
      expect(spawnPlan('git', [arg], win)).toEqual({ file: exe, args: [arg] })
    },
  )

  test('win32 refuses a batch file whose path holds a %', () => {
    const gradlew = file('x%PATH:a=b%/gradlew.bat')
    const plan = spawnPlan(gradlew, ['build'], win)
    expect(plan).toEqual({ refusal: expect.stringContaining('batch file path') })
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
  // A batch file outside node_modules, as a global `npm.cmd` or `gradlew.bat` is.
  const plainBat = file('real/bin/echo-args.bat', `@node "${script}" %*\r\n`)
  test.each([npmShim, plainBat])(
    'every hostile argument reaches node unchanged through %s',
    async (target) => {
      const args = HOSTILE.filter((a) => !a.includes('%'))
      const sync = spawnRunner(target).run(args, { cwd: root })
      expect(sync.error).toBeUndefined()
      expect(JSON.parse(sync.stdout)).toEqual(args)
      const later = await spawnRunnerAsync(target).run(args, { cwd: root })
      expect(JSON.parse(later.stdout)).toEqual(args)
    },
  )

  // A batch file that only echoes its argument, with no node in between.
  const echoBat = file('real/bin/echo-one.bat', '@echo off\r\necho [%~1]\r\n')

  test('a plain .bat echoes its argument, with the quotes the escaping leaves (see README Platforms)', () => {
    for (const arg of ['plain', 'a b']) {
      const r = spawnRunner(echoBat).run([arg], { cwd: root })
      expect(r.stdout.trim()).toBe(`["${arg}"]`)
    }
  })

  test.each(['%COMSPEC%', '%COMSPEC:~0,2%', '%COMSPEC:C=X%'])(
    'a % form %s is refused, not expanded by cmd.exe',
    (arg) => {
      const r = spawnRunner(echoBat).run([arg], { cwd: root })
      expect(r).toMatchObject({ neverExited: true, reason: 'spawn' })
      expect(r.stdout).not.toContain('[')
    },
  )

  test('a line break is refused as a spawn failure', () => {
    const r = spawnRunner(npmShim).run(['a\nb'], { cwd: root })
    expect(r).toMatchObject({ neverExited: true, reason: 'spawn' })
    expect(classifyFailure(r)?.kind).toBe('spawn')
  })
})
