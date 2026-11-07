/**
 * WezTerm host tests. DOCS-ONLY: WezTerm was not installed when these were
 * written, so every argv and JSON shape here comes from the published CLI
 * reference (wezterm.org/cli/cli/{spawn,send-text,list,activate-pane,get-text}.html),
 * not from a run. See docs/planning/research/wezterm.md.
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import type { CommandResult, CommandRunner } from '@osdlc/command-seam'

import { rememberSessionPane } from '../src/hosts/session-panes.ts'
import {
  makeWeztermHost,
  normalizePath,
  parseWeztermList,
  weztermCwdPath,
  weztermSpawnArgv,
} from '../src/hosts/wezterm.ts'
import { RUNTIME } from './fixtures/runtime.ts'

const ok = (stdout = ''): CommandResult => ({ exitCode: 0, stdout, stderr: '' })
const fail: CommandResult = { exitCode: 1, stdout: '', stderr: 'Error: no running instance' }

function recorder(replies: CommandResult[]) {
  const calls: string[][] = []
  const runner: CommandRunner = {
    run(argv) {
      calls.push([...argv])
      return replies.shift() ?? ok()
    },
  }
  return { runner, calls }
}

const list = (rows: { pane_id: number; cwd: string; tty_name?: string }[]) => JSON.stringify(rows)

describe('wezterm host', () => {
  test('platforms is all', () => {
    expect(makeWeztermHost({ runtimeDir: RUNTIME }).platforms).toBe('all')
  })

  test('spawn argv passes the program directly after --', () => {
    expect(weztermSpawnArgv({ cwd: '/w', argv: ['claude', '-p', 'x'], title: 't' })).toEqual([
      'cli',
      'spawn',
      '--cwd',
      '/w',
      '--',
      'claude',
      '-p',
      'x',
    ])
    expect(weztermSpawnArgv({ cwd: '/w', argv: ['a'], title: 't' }, true)).toContain('--new-window')
  })

  test('terminal throws a clear error when no GUI/mux answers', () => {
    const { runner } = recorder([fail])
    expect(() =>
      makeWeztermHost({ runtimeDir: RUNTIME, runner }).terminal!({
        cwd: '/w',
        argv: ['a'],
        title: 't',
      }),
    ).toThrow(/wezterm cli spawn failed.*running/)
  })

  test('cwd URL parsing: posix, percent-encoding, windows drive and UNC', () => {
    expect(weztermCwdPath('file://foo/home/wez/', 'linux', 'foo')).toBe('/home/wez/')
    expect(weztermCwdPath('file:///home/a%20b', 'linux')).toBe('/home/a b')
    expect(weztermCwdPath('file:///C:/Users/Me/proj%20x/', 'win32')).toBe('C:/Users/Me/proj x/')
    expect(weztermCwdPath('file://server/share/p', 'win32')).toBe('//server/share/p')
    expect(weztermCwdPath('not a url', 'linux')).toBeNull()
    expect(weztermCwdPath('http://x/y', 'linux')).toBeNull()
  })

  test('win32 match: backslash cwd, case-insensitive, trailing slash ignored', () => {
    const out = list([
      { pane_id: 7, cwd: 'file:///C:/Users/Me/proj/' },
      { pane_id: 8, cwd: 'file:///C:/Users/Me/other/' },
    ])
    expect(parseWeztermList(out, 'c:\\users\\me\\proj', 'win32')).toEqual([
      { paneId: 7, cwd: 'c:\\users\\me\\proj' },
    ])
    expect(normalizePath('/a/b/', 'linux')).toBe('/a/b')
  })

  test('find: maps matching panes to handles; failure or garbage is []', () => {
    const rows = list([
      { pane_id: 3, cwd: 'file://host/w/' },
      { pane_id: 4, cwd: 'file://host/elsewhere/' },
    ])
    const host = makeWeztermHost({
      runtimeDir: RUNTIME,
      runner: recorder([ok(rows)]).runner,
      platform: 'linux',
      localHost: 'host',
    })
    expect(host.find!({ cwd: '/w' })).toEqual([
      { cwd: '/w', harness: null, alive: true, lastOutputAt: null, handle: '3' },
    ])
    expect(
      makeWeztermHost({ runtimeDir: RUNTIME, runner: recorder([fail]).runner }).find!({
        cwd: '/w',
      }),
    ).toEqual([])
    expect(
      makeWeztermHost({ runtimeDir: RUNTIME, runner: recorder([ok('nope')]).runner }).find!({
        cwd: '/w',
      }),
    ).toEqual([])
  })

  test('send: bracketed-paste text via stdin then carriage return, only to a spawned pane', () => {
    const regDir = mkdtempSync(join(tmpdir(), 'wz-reg-'))
    const spawnRun = recorder([
      ok('3\n'),
      ok(list([{ pane_id: 3, cwd: 'file:///w', tty_name: '/dev/ttys3' }])),
    ])
    const base = { platform: 'linux' as const, registryDir: regDir, localHost: 'me' }
    makeWeztermHost({ runtimeDir: RUNTIME, runner: spawnRun.runner, ...base }).terminal!({
      cwd: '/w',
      argv: ['a'],
      title: 't',
    })
    const inputs: Array<string | undefined> = []
    const calls: string[][] = []
    const replies = [
      ok(list([{ pane_id: 3, cwd: 'file:///w', tty_name: '/dev/ttys3' }])),
      ok(),
      ok(),
    ]
    const runner: CommandRunner = {
      run(argv, o) {
        calls.push([...argv])
        inputs.push(o.input)
        return replies.shift() ?? ok()
      },
    }
    const host = makeWeztermHost({ runtimeDir: RUNTIME, runner, ...base })
    expect(host.send!({ cwd: '/w', text: '-x\nline2' })).toEqual({ accepted: true, ack: false })
    expect(calls.slice(1)).toEqual([
      ['cli', 'send-text', '--pane-id', '3'],
      ['cli', 'send-text', '--pane-id', '3', '--no-paste', '\r'],
    ])
    expect(inputs[1]).toBe('-x\nline2')
    rmSync(regDir, { recursive: true, force: true })
  })

  test('send: a pane this host did not spawn (a plain shell) never receives text', () => {
    const regDir = mkdtempSync(join(tmpdir(), 'wz-reg-'))
    const { runner, calls } = recorder([ok(list([{ pane_id: 3, cwd: 'file:///w' }])), ok(), ok()])
    const host = makeWeztermHost({ runner, platform: 'linux', registryDir: regDir })
    expect(host.send!({ cwd: '/w', text: 'x' })).toEqual({ accepted: false, ack: false })
    expect(calls).toHaveLength(1)
    rmSync(regDir, { recursive: true, force: true })
  })

  test('send: a reused pane id on another tty is never typed into, and a lookup prunes its stale entry', () => {
    const regDir = mkdtempSync(join(tmpdir(), 'wz-reg-'))
    const base = { platform: 'linux' as const, registryDir: regDir, localHost: 'me' }
    const spawned = list([{ pane_id: 3, cwd: 'file:///w', tty_name: '/dev/ttys3' }])
    makeWeztermHost({
      runtimeDir: RUNTIME,
      runner: recorder([ok('3\n'), ok(spawned)]).runner,
      ...base,
    }).terminal!({
      cwd: '/w',
      argv: ['a'],
      title: 't',
    })
    const file = join(regDir, 'spawned', '3.json')
    expect(readFileSync(file, 'utf-8')).toContain('/dev/ttys3')
    // The mux restarted: id 3 is now an ordinary shell on a different tty.
    const reused = list([{ pane_id: 3, cwd: 'file:///w', tty_name: '/dev/ttys9' }])
    const send = () => {
      const { runner, calls } = recorder([ok(reused), ok(), ok()])
      const receipt = makeWeztermHost({ runtimeDir: RUNTIME, runner, ...base }).send!({
        cwd: '/w',
        text: 'x',
      })
      return { receipt, calls }
    }
    const first = send()
    expect(first.receipt).toEqual({ accepted: false, ack: false })
    expect(first.calls).toHaveLength(1)
    // Just written: spared, in case a concurrent spawn recorded it after this listing.
    expect(existsSync(file)).toBe(true)
    const old = new Date(Date.now() - 60_000)
    utimesSync(file, old, old)
    expect(send().receipt).toEqual({ accepted: false, ack: false })
    expect(existsSync(file)).toBe(false)
    rmSync(regDir, { recursive: true, force: true })
  })

  test('two spawns from separate host instances both stay remembered', () => {
    const regDir = mkdtempSync(join(tmpdir(), 'wz-reg-'))
    const base = { platform: 'linux' as const, registryDir: regDir, localHost: 'me' }
    // Each spawn's listing predates the other's pane, as with two concurrent `terminal()` calls.
    for (const pane of [3, 4]) {
      const rows = list([{ pane_id: pane, cwd: 'file:///w', tty_name: `/dev/ttys${pane}` }])
      makeWeztermHost({
        runtimeDir: RUNTIME,
        runner: recorder([ok(`${pane}\n`), ok(rows)]).runner,
        ...base,
      }).terminal!({ cwd: '/w', argv: ['a'], title: 't' })
    }
    expect(readdirSync(join(regDir, 'spawned')).sort()).toEqual(['3.json', '4.json'])
    // Both panes are recognised as spawned here: focus picks each when it is the only one listed.
    for (const pane of [3, 4]) {
      const rows = list([
        { pane_id: 1, cwd: 'file:///w', tty_name: '/dev/ttys1' },
        { pane_id: pane, cwd: 'file:///w', tty_name: `/dev/ttys${pane}` },
      ])
      const f = recorder([ok(rows), ok()])
      expect(
        makeWeztermHost({ runtimeDir: RUNTIME, runner: f.runner, ...base }).focus!({ cwd: '/w' }),
      ).toBe(true)
      expect(f.calls[1]).toEqual(['cli', 'activate-pane', '--pane-id', String(pane)])
    }
    rmSync(regDir, { recursive: true, force: true })
  })

  test('send: no session is not accepted', () => {
    const none = makeWeztermHost({ runtimeDir: RUNTIME, runner: recorder([fail]).runner })
    expect(none.send!({ cwd: '/w', text: 'x' })).toEqual({ accepted: false, ack: false })
  })

  test('posix file URL host must be local; a malformed escape drops only its row', () => {
    expect(weztermCwdPath('file://remotebox/w', 'linux', 'me')).toBeNull()
    expect(weztermCwdPath('file://me/w', 'linux', 'me')).toBe('/w')
    expect(weztermCwdPath('file://me.local/w', 'linux', 'me.local')).toBe('/w')
    expect(weztermCwdPath('file://localhost/w', 'linux', 'me')).toBe('/w')
    expect(weztermCwdPath('file:///w%zz', 'linux', 'me')).toBeNull()
    const out = list([
      { pane_id: 1, cwd: 'file:///w%zz' },
      { pane_id: 2, cwd: 'file://remotebox/w' },
      { pane_id: 3, cwd: 'file:///w' },
    ])
    expect(parseWeztermList(out, '/w', 'linux', 'me')).toEqual([{ paneId: 3, cwd: '/w' }])
  })

  test('focus and capture prefer the pane this host spawned over another pane at the cwd', () => {
    const regDir = mkdtempSync(join(tmpdir(), 'wz-reg-'))
    const base = { platform: 'linux' as const, registryDir: regDir, localHost: 'me' }
    const tty = list([{ pane_id: 3, cwd: 'file:///w', tty_name: '/dev/ttys3' }])
    makeWeztermHost({ runtimeDir: RUNTIME, runner: recorder([ok('3\n'), ok(tty)]).runner, ...base })
      .terminal!({
      cwd: '/w',
      argv: ['a'],
      title: 't',
    })
    const rows = list([
      { pane_id: 2, cwd: 'file:///w', tty_name: '/dev/ttys2' },
      { pane_id: 3, cwd: 'file:///w', tty_name: '/dev/ttys3' },
    ])
    const f = recorder([ok(rows), ok()])
    expect(
      makeWeztermHost({ runtimeDir: RUNTIME, runner: f.runner, ...base }).focus!({ cwd: '/w' }),
    ).toBe(true)
    expect(f.calls[1]).toEqual(['cli', 'activate-pane', '--pane-id', '3'])
    const c = recorder([ok(rows), ok('screen')])
    expect(
      makeWeztermHost({ runtimeDir: RUNTIME, runner: c.runner, ...base }).capture!({ cwd: '/w' }),
    ).toBe('screen')
    expect(c.calls[1]).toEqual(['cli', 'get-text', '--pane-id', '3'])
    rmSync(regDir, { recursive: true, force: true })
  })

  test('focus and capture use the found pane id; no session is false/null', () => {
    const row = list([{ pane_id: 5, cwd: 'file:///w' }])
    const f = recorder([ok(row), ok()])
    expect(
      makeWeztermHost({ runtimeDir: RUNTIME, runner: f.runner, platform: 'linux' }).focus!({
        cwd: '/w',
      }),
    ).toBe(true)
    expect(f.calls[1]).toEqual(['cli', 'activate-pane', '--pane-id', '5'])
    const c = recorder([ok(row), ok('screen')])
    expect(
      makeWeztermHost({ runtimeDir: RUNTIME, runner: c.runner, platform: 'linux' }).capture!({
        cwd: '/w',
      }),
    ).toBe('screen')
    expect(c.calls[1]).toEqual(['cli', 'get-text', '--pane-id', '5'])
    expect(
      makeWeztermHost({ runtimeDir: RUNTIME, runner: recorder([fail]).runner }).focus!({
        cwd: '/w',
      }),
    ).toBe(false)
    expect(
      makeWeztermHost({ runtimeDir: RUNTIME, runner: recorder([fail]).runner }).capture!({
        cwd: '/w',
      }),
    ).toBeNull()
  })

  describe('addressing by session id', () => {
    const rows = list([
      { pane_id: 3, cwd: 'file:///w', tty_name: '/dev/ttys3' },
      { pane_id: 4, cwd: 'file:///w', tty_name: '/dev/ttys4' },
      { pane_id: 9, cwd: 'file:///elsewhere' },
    ])

    /** Two sessions spawned into panes 3 and 4 of the same cwd. */
    function spawned() {
      const regDir = mkdtempSync(join(tmpdir(), 'wz-reg-'))
      const base = { platform: 'linux' as const, registryDir: regDir, localHost: 'me' }
      for (const [id, pane] of [
        ['s-1', '3'],
        ['s-2', '4'],
      ] as const) {
        makeWeztermHost({
          runtimeDir: RUNTIME,
          runner: recorder([ok(`${pane}\n`), ok(rows)]).runner,
          ...base,
        }).terminal!({
          cwd: '/w',
          argv: ['a'],
          title: 't',
          sessionId: id,
        })
      }
      return { base, regDir }
    }

    test('two sessions in one cwd reach their own panes for send, focus, capture and close', () => {
      const { base, regDir } = spawned()
      const run = (replies: CommandResult[]) => recorder(replies)
      const send = run([ok(rows), ok(), ok()])
      expect(
        makeWeztermHost({ runtimeDir: RUNTIME, runner: send.runner, ...base }).send!({
          cwd: '/w',
          sessionId: 's-2',
          text: 'hi',
        }),
      ).toEqual({ accepted: true, ack: false })
      expect(send.calls[1]).toEqual(['cli', 'send-text', '--pane-id', '4'])
      const focus = run([ok(rows), ok()])
      expect(
        makeWeztermHost({ runtimeDir: RUNTIME, runner: focus.runner, ...base }).focus!({
          cwd: '/w',
          sessionId: 's-1',
        }),
      ).toBe(true)
      expect(focus.calls[1]).toEqual(['cli', 'activate-pane', '--pane-id', '3'])
      const cap = run([ok(rows), ok('screen')])
      expect(
        makeWeztermHost({ runtimeDir: RUNTIME, runner: cap.runner, ...base }).capture!({
          cwd: '/w',
          sessionId: 's-2',
        }),
      ).toBe('screen')
      expect(cap.calls[1]).toEqual(['cli', 'get-text', '--pane-id', '4'])
      const close = run([ok(rows), ok()])
      expect(
        makeWeztermHost({ runtimeDir: RUNTIME, runner: close.runner, ...base }).close!({
          cwd: '/w',
          sessionId: 's-1',
        }),
      ).toBe(true)
      expect(close.calls[1]).toEqual(['cli', 'kill-pane', '--pane-id', '3'])
      rmSync(regDir, { recursive: true, force: true })
    })

    test('find with an id returns just its pane, found wherever its cwd moved to', () => {
      const { base, regDir } = spawned()
      const moved = list([{ pane_id: 3, cwd: 'file:///elsewhere', tty_name: '/dev/ttys3' }])
      const found = makeWeztermHost({
        runtimeDir: RUNTIME,
        runner: recorder([ok(moved)]).runner,
        ...base,
      }).find!({
        cwd: '/w',
        sessionId: 's-1',
      })
      expect(found.map((f) => f.handle)).toEqual(['3'])
      rmSync(regDir, { recursive: true, force: true })
    })

    test('a session whose pane is gone is not found by falling back to the cwd', () => {
      const { base, regDir } = spawned()
      const onlyOther = list([{ pane_id: 4, cwd: 'file:///w' }])
      const host = (r: CommandResult[]) =>
        makeWeztermHost({ runtimeDir: RUNTIME, runner: recorder(r).runner, ...base })
      expect(host([ok(onlyOther)]).find!({ cwd: '/w', sessionId: 's-1' })).toEqual([])
      expect(host([ok(onlyOther)]).focus!({ cwd: '/w', sessionId: 's-1' })).toBe(false)
      expect(host([ok(onlyOther)]).close!({ cwd: '/w', sessionId: 's-1' })).toBe(false)
      rmSync(regDir, { recursive: true, force: true })
    })

    test('close refuses a remembered pane id that is now listed at another cwd (a reissued id)', () => {
      const { base, regDir } = spawned()
      const reissued = list([{ pane_id: 3, cwd: 'file:///people/shell' }])
      const c = recorder([ok(reissued), ok()])
      expect(
        makeWeztermHost({ runtimeDir: RUNTIME, runner: c.runner, ...base }).close!({
          cwd: '/w',
          sessionId: 's-1',
        }),
      ).toBe(false)
      expect(c.calls.some((a) => a.includes('kill-pane'))).toBe(false)
      rmSync(regDir, { recursive: true, force: true })
    })

    test('close refuses a remembered pane id this host did not spawn', () => {
      const regDir = mkdtempSync(join(tmpdir(), 'wz-reg-'))
      rememberSessionPane(regDir, 's-x', '7', '/w')
      const c = recorder([ok(list([{ pane_id: 7, cwd: 'file:///w' }])), ok()])
      const host = makeWeztermHost({
        runner: c.runner,
        platform: 'linux',
        registryDir: regDir,
        localHost: 'me',
      })
      expect(host.close!({ cwd: '/w', sessionId: 's-x' })).toBe(false)
      // Listed, never killed.
      expect(c.calls.map((argv) => argv[1])).toEqual(['list'])
      rmSync(regDir, { recursive: true, force: true })
    })

    test('close refuses a remembered pane id reissued at the same cwd on another tty', () => {
      const { base, regDir } = spawned()
      // The mux restarted: id 3 is now a person's shell in the same cwd.
      const reused = list([{ pane_id: 3, cwd: 'file:///w', tty_name: '/dev/ttys99' }])
      const c = recorder([ok(reused), ok()])
      expect(
        makeWeztermHost({ runtimeDir: RUNTIME, runner: c.runner, ...base }).close!({
          cwd: '/w',
          sessionId: 's-1',
        }),
      ).toBe(false)
      expect(c.calls.some((a) => a.includes('kill-pane'))).toBe(false)
      rmSync(regDir, { recursive: true, force: true })
    })

    test('send, find, focus and capture refuse a remembered pane id reissued on another tty', () => {
      const { base, regDir } = spawned()
      const reused = list([{ pane_id: 3, cwd: 'file:///home/me', tty_name: '/dev/ttys99' }])
      const s = recorder([ok(reused), ok(), ok()])
      const host = (r: CommandResult[]) =>
        makeWeztermHost({ runtimeDir: RUNTIME, runner: recorder(r).runner, ...base })
      expect(
        makeWeztermHost({ runtimeDir: RUNTIME, runner: s.runner, ...base }).send!({
          cwd: '/w',
          sessionId: 's-1',
          text: 'rm -rf build',
        }),
      ).toEqual({ accepted: false, ack: false })
      expect(s.calls.some((a) => a.includes('send-text'))).toBe(false)
      expect(host([ok(reused)]).find!({ cwd: '/w', sessionId: 's-1' })).toEqual([])
      expect(host([ok(reused), ok()]).focus!({ cwd: '/w', sessionId: 's-1' })).toBe(false)
      expect(host([ok(reused), ok('x')]).capture!({ cwd: '/w', sessionId: 's-1' })).toBeNull()
      rmSync(regDir, { recursive: true, force: true })
    })

    test('an id nothing was remembered for resolves by cwd, but close refuses it', () => {
      const { base, regDir } = spawned()
      const f = recorder([ok(rows), ok()])
      expect(
        makeWeztermHost({ runtimeDir: RUNTIME, runner: f.runner, ...base }).focus!({
          cwd: '/w',
          sessionId: 'old',
        }),
      ).toBe(true)
      const c = recorder([ok(rows), ok()])
      expect(
        makeWeztermHost({ runtimeDir: RUNTIME, runner: c.runner, ...base }).close!({
          cwd: '/w',
          sessionId: 'old',
        }),
      ).toBe(false)
      expect(c.calls).toEqual([])
      rmSync(regDir, { recursive: true, force: true })
    })
  })
})
