import { describe, expect, test } from 'vitest'

import type { CommandResult, CommandRunner } from '@osdlc/command-seam'

import { HOST_NAMES, hostCanWait, requirePart } from '../src/contract.ts'
import {
  makeTerminalAppOpener,
  makeWindowHost,
  TERMINAL_APP_PATH,
  terminalAppArgv,
  windowShellCommand,
} from '../src/hosts/window.ts'

const ok: CommandResult = { exitCode: 0, stdout: '', stderr: '' }

function scripted(res: CommandResult = ok): { runner: CommandRunner; calls: string[][] } {
  const calls: string[][] = []
  return {
    calls,
    runner: {
      run(argv) {
        calls.push([...argv])
        return res
      },
    },
  }
}

describe('window argv builders', () => {
  test('shell command: cd, then the quoted argv', () => {
    expect(windowShellCommand({ cwd: '/my dir', argv: ['claude', 'hi there'], title: 't' })).toBe(
      "cd '/my dir' && claude 'hi there'",
    )
  })

  test('shell command: a relative cwd becomes absolute', () => {
    expect(windowShellCommand({ cwd: 'rel', argv: ['ls'], title: 't' })).toBe(
      `cd ${process.cwd()}/rel && ls`,
    )
  })

  test('Terminal.app: activate then do script, one -e per line', () => {
    expect(terminalAppArgv('cd /w && claude')).toEqual([
      'osascript',
      '-e',
      'tell application "Terminal"',
      '-e',
      'activate',
      '-e',
      'do script "cd /w && claude"',
      '-e',
      'end tell',
    ])
  })

  test('Terminal.app: newlines are escaped in the script literal', () => {
    expect(terminalAppArgv("echo 'a\nb'")).toContain('do script "echo \'a\\nb\'"')
  })

  test('Terminal.app: focus false drops activate; quotes and backslashes are escaped', () => {
    const argv = terminalAppArgv('echo "a\\b"', { focus: false })
    expect(argv).not.toContain('activate')
    expect(argv).toContain('do script "echo \\"a\\\\b\\""')
  })
})

describe('window host', () => {
  test('terminal opens one window through the runner and returns 0', () => {
    const { runner, calls } = scripted()
    const host = makeWindowHost({ runner })
    expect(host.terminal?.({ cwd: '/w', argv: ['claude'], title: 't' })).toBe(0)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('do script "cd /w && claude"')
  })

  test('session carries env into the window command', () => {
    const { runner, calls } = scripted()
    const host = makeWindowHost({ runner })
    const res = requirePart(
      host,
      'session',
    )({
      cwd: '/w',
      harness: 'claude',
      binary: 'claude',
      prompt: 'hi',
      title: 't',
      env: { FOO: 'bar' },
    })
    expect(res.exitCode).toBe(0)
    expect(calls[0]?.join(' ')).toContain('env FOO=bar claude')
  })

  test('a failed open throws with the opener stderr', () => {
    const { runner } = scripted({ exitCode: 1, stdout: '', stderr: 'not authorized' })
    const host = makeWindowHost({ runner })
    expect(() => host.terminal?.({ cwd: '/w', argv: ['x'], title: 't' })).toThrow(/not authorized/)
  })

  test('a caller-supplied opener builds the argv', () => {
    const { runner, calls } = scripted()
    const host = makeWindowHost({
      runner,
      opener: { available: () => true, argv: (cmd) => ['open-it', '--run', cmd] },
    })
    host.terminal?.({ cwd: '/w', argv: ['claude'], title: 't' })
    expect(calls[0]).toEqual(['--run', 'cd /w && claude'])
  })

  test('available needs the platform and the opener', () => {
    const present = makeTerminalAppOpener({ exists: (p) => p === TERMINAL_APP_PATH })
    const absent = makeTerminalAppOpener({ exists: () => false })
    expect(makeWindowHost({ opener: present, platforms: [process.platform] }).available()).toBe(
      true,
    )
    expect(makeWindowHost({ opener: absent, platforms: [process.platform] }).available()).toBe(
      false,
    )
    expect(makeWindowHost({ opener: present, platforms: [] }).available()).toBe(false)
  })

  test('platforms default to macOS for the built-in opener and all for a supplied one', () => {
    expect(makeWindowHost().platforms).toEqual(['darwin'])
    const opener = { available: () => true, argv: (c: string) => ['x', c] }
    expect(makeWindowHost({ opener }).platforms).toBe('all')
  })

  test('an opener returning an empty argv throws and runs nothing', () => {
    const { runner, calls } = scripted()
    const host = makeWindowHost({ runner, opener: { available: () => true, argv: () => [] } })
    expect(() => host.terminal?.({ cwd: '/w', argv: ['claude'], title: 't' })).toThrow(/empty argv/)
    expect(calls).toHaveLength(0)
  })

  test('is a registered host name and cannot wait', () => {
    expect(HOST_NAMES).toContain('window')
    expect(hostCanWait('window')).toBe(false)
  })
})
