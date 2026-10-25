/**
 * `commandString`: a command line for a person to paste, per shell. Pure, so
 * every branch runs on every OS.
 */

import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { commandString, shellJoin, spawnRunner, which } from '../src/index.ts'

const HOSTILE = [
  '',
  'two words',
  "it's",
  'say "hi"',
  'trailing\\',
  'a&b|c<d>e^f',
  '%PATH%',
  '!x!',
  '$HOME',
  '`whoami`',
  '(x)',
  '--%',
  '@args',
  'a,b',
  '0x10',
  'héllo ✓',
  'curly ‘quote’',
]

describe('commandString', () => {
  test('defaults: POSIX off Windows, PowerShell on it', () => {
    expect(commandString(['git', 'status'], { platform: 'linux' })).toBe('git status')
    expect(commandString(['git', 'status'], { platform: 'darwin' })).toBe('git status')
    expect(commandString(['git', 'status'], { platform: 'win32' })).toBe('& git status')
  })

  test('POSIX follows shellJoin for every word', () => {
    const argv = ['tool', ...HOSTILE]
    expect(commandString(argv, { shell: 'posix' })).toBe(shellJoin(argv))
  })

  test('POSIX cwd prefixes cd, with -- for a folder that looks like an option', () => {
    expect(commandString(['ls'], { platform: 'linux', cwd: '/my repo' })).toBe(
      "cd '/my repo' && ls",
    )
    expect(commandString(['ls'], { platform: 'linux', cwd: '/repo' })).toBe('cd /repo && ls')
    expect(commandString(['ls'], { platform: 'linux', cwd: '-x' })).toBe('cd -- -x && ls')
  })

  test('PowerShell single-quotes anything not inert and doubles single quotes', () => {
    const ps = (w: string) =>
      commandString(['tool', w], { shell: 'powershell' }).slice('& tool '.length)
    expect(ps('--flag=C:\\x/y.z')).toBe('--flag=C:\\x/y.z')
    expect(ps('')).toBe("''")
    expect(ps('two words')).toBe("'two words'")
    expect(ps("it's")).toBe("'it''s'")
    expect(ps('curly ‘quote’')).toBe("'curly ‘‘quote’’'")
    expect(ps('$HOME')).toBe("'$HOME'")
    expect(ps('`whoami`')).toBe("'`whoami`'")
    expect(ps('--%')).toBe("'--%'")
    expect(ps('@args')).toBe("'@args'")
    expect(ps('a,b')).toBe("'a,b'")
    expect(ps('0x10')).toBe("'0x10'")
  })

  test('PowerShell always emits the call operator, so a quoted program runs', () => {
    expect(
      commandString(['C:\\Program Files\\Git\\bin\\git.exe', 'status'], { platform: 'win32' }),
    ).toBe("& 'C:\\Program Files\\Git\\bin\\git.exe' status")
  })

  test('PowerShell cwd runs the command only when Set-Location works', () => {
    expect(commandString(['git', 'status'], { platform: 'win32', cwd: 'C:\\my repo' })).toBe(
      "if (Set-Location -LiteralPath 'C:\\my repo' -PassThru) { & git status }",
    )
  })

  test.each(HOSTILE)('PowerShell %j: one single-quoted literal or one bare word', (w) => {
    const word = commandString(['tool', w], { shell: 'powershell' }).slice('& tool '.length)
    if (word.startsWith("'")) {
      // Undo the quoting: strip the outer quotes, halve each doubled quote.
      expect(word.slice(1, -1).replace(/(['‘’‚‛])\1/g, '$1')).toBe(w)
      expect(word.slice(1, -1).replace(/(['‘’‚‛])\1/g, '')).not.toMatch(/['‘’‚‛]/)
    } else {
      expect(word).toBe(w)
    }
  })

  test('cmd leaves inert words bare and escapes the rest', () => {
    expect(commandString(['git', 'log', '-n', '5'], { shell: 'cmd' })).toBe('git log -n 5')
    expect(commandString(['echo', 'a&b', '!x!', ''], { shell: 'cmd' })).toBe(
      'echo ^"a^&b^" ^"^!x^!^" ^"^"',
    )
    expect(commandString(['C:\\Program Files\\x.exe', 'a=b'], { shell: 'cmd' })).toBe(
      'C:\\Program^ Files\\x.exe ^"a=b^"',
    )
  })

  test('cmd cwd prefixes cd /d', () => {
    expect(commandString(['dir'], { shell: 'cmd', cwd: 'C:\\my repo' })).toBe(
      'cd /d C:\\my^ repo && dir',
    )
  })

  test.each(['%PATH%', '%PATH:a=b%', '%PATH:~0,2%', 'a%b'])(
    'cmd refuses %j, which cmd.exe expands before it reads any ^',
    (w) => {
      expect(() => commandString(['echo', w], { shell: 'cmd' })).toThrow(/cannot quote a %/)
      expect(() => commandString([w], { shell: 'cmd' })).toThrow(/cannot quote a %/)
      expect(() => commandString(['dir'], { shell: 'cmd', cwd: `C:\\${w}` })).toThrow(
        /cannot quote a %/,
      )
    },
  )

  test('cmd refuses a line break; an empty argv is refused everywhere', () => {
    expect(() => commandString(['echo', 'a\nb'], { shell: 'cmd' })).toThrow(RangeError)
    expect(() => commandString(['echo'], { shell: 'cmd', cwd: 'a\r\nb' })).toThrow(RangeError)
    expect(commandString(['echo', 'a\nb'], { shell: 'powershell' })).toBe("& echo 'a\nb'")
    for (const shell of ['posix', 'powershell', 'cmd'] as const) {
      expect(() => commandString([], { shell })).toThrow(RangeError)
    }
  })

  test('shell overrides platform', () => {
    expect(commandString(['a b'], { platform: 'linux', shell: 'powershell' })).toBe("& 'a b'")
    expect(commandString(['a b'], { platform: 'win32', shell: 'posix' })).toBe("'a b'")
  })
})

const powershell = which('pwsh') ?? which('powershell')

describe.skipIf(powershell === undefined)('a real PowerShell', () => {
  const shell = spawnRunner(powershell ?? 'pwsh')
  const run = (cwd: string) => {
    const line = commandString(['node', '-e', 'console.log("ran")'], { shell: 'powershell', cwd })
    return shell.run(['-NoProfile', '-NonInteractive', '-Command', line], { cwd: process.cwd() })
  }

  test('runs the command after a change of folder that works', () => {
    expect(run(process.cwd()).stdout).toContain('ran')
  }, 30_000)

  test('does not run the command when Set-Location fails', () => {
    const r = run(join(process.cwd(), 'no-such-folder-for-command-string'))
    expect(r.stdout).not.toContain('ran')
    expect(r.stderr).not.toBe('')
  }, 30_000)
})
