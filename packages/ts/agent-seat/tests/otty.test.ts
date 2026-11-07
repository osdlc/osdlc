/**
 * otty 1.5.4 host tests. Provenance (S-0014, docs/planning/research/otty.md):
 * - OBSERVED: `otty help <noun> <verb>` flag spellings used in the argv
 *   builders; the not-running failure ("Cannot connect to Otty ... Is Otty running?").
 * - DOCS-ONLY / UNVERIFIED (synthetic fixtures below): the shape of
 *   `otty pane list --json`, including whether it carries a cwd or a tab
 *   title. The app was not running. Confirm with a capture of
 *   `otty pane list --json` from a running Otty before trusting them.
 */

import { describe, expect, test } from 'vitest'

import type { CommandResult, CommandRunner } from '@osdlc/command-seam'

import {
  makeOttyHost,
  ottyCaptureArgv,
  ottyCloseArgv,
  ottyCreateArgv,
  ottyFocusArgv,
  ottySendArgv,
  ottyTag,
  parseOttyPanes,
} from '../src/hosts/otty.ts'

const ok = (stdout = ''): CommandResult => ({ exitCode: 0, stdout, stderr: '' })
const down: CommandResult = {
  exitCode: 1,
  stdout: '',
  stderr:
    'error: Cannot connect to Otty at /x/otty.sock: No such file or directory (os error 2). Is Otty running?',
}

function scripted(handler: (argv: string[]) => CommandResult): {
  runner: CommandRunner
  calls: string[][]
} {
  const calls: string[][] = []
  return {
    calls,
    runner: {
      run(argv) {
        calls.push([...argv])
        return handler(argv)
      },
    },
  }
}

const tag = ottyTag('/w')
const listJson = JSON.stringify([
  { id: 7, title: `PR #1 ${tag}`, foreground_process: 'claude' },
  { id: 8, title: 'other' },
  { id: 9, cwd: '/w' },
])

describe('otty argv', () => {
  test('create: unfocused, tagged title', () => {
    expect(ottyCreateArgv({ cwd: '/w', argv: ['claude'], title: 'PR #1' })).toEqual([
      'tab',
      'new',
      '--cwd',
      '/w',
      '--command',
      'claude',
      '--title',
      `PR #1 ${tag}`,
      '--no-focus',
      '--json',
    ])
  })
  test('send, focus, capture', () => {
    expect(ottySendArgv('7', 'hi')).toEqual([
      'pane',
      'send-keys',
      '--pane',
      '7',
      '--bracketed-paste',
      '--',
      'hi',
      'key:Enter',
    ])
    expect(ottyFocusArgv('7')).toEqual(['pane', 'focus', '7'])
    expect(ottyCaptureArgv('7')).toEqual(['pane', 'capture', '--pane', '7'])
  })
})

describe('otty parsing (unverified fixtures)', () => {
  test('matches by tag in the title or by a cwd field', () => {
    expect(parseOttyPanes(listJson, '/w')).toEqual(['7', '9'])
    expect(parseOttyPanes(JSON.stringify({ panes: [{ pane_id: 'p1', cwd: '/w' }] }), '/w')).toEqual(
      ['p1'],
    )
    expect(parseOttyPanes('garbage', '/w')).toEqual([])
  })
})

describe('otty host', () => {
  test('send resolves the pane then pastes; ack false', () => {
    const { runner, calls } = scripted((a) => (a[1] === 'list' ? ok(listJson) : ok()))
    expect(makeOttyHost({ runner }).send!({ cwd: '/w', text: 'hi' })).toEqual({
      accepted: true,
      ack: false,
    })
    expect(calls[1]).toEqual(ottySendArgv('7', 'hi'))
  })

  test('send goes only to a tagged pane, never one matched by cwd alone', () => {
    const cwdOnly = JSON.stringify([{ id: 9, cwd: '/w' }])
    const { runner, calls } = scripted((a) => (a[1] === 'list' ? ok(cwdOnly) : ok()))
    const host = makeOttyHost({ runner })
    expect(host.find!({ cwd: '/w' })[0]?.handle).toBe('9')
    expect(host.send!({ cwd: '/w', text: 'hi' })).toEqual({ accepted: false, ack: false })
    expect(calls.some((c) => c[1] === 'send-keys')).toBe(false)
    expect(parseOttyPanes(listJson, '/w', { taggedOnly: true })).toEqual(['7'])
  })

  test('a tagged pane whose agent exited (a shell) is not alive and never receives text', () => {
    const shell = JSON.stringify([{ id: 7, title: `PR #1 ${tag}`, foreground_process: 'zsh' }])
    const { runner, calls } = scripted((a) => (a[1] === 'list' ? ok(shell) : ok()))
    const host = makeOttyHost({ runner })
    expect(host.find!({ cwd: '/w' })[0]?.alive).toBe(false)
    expect(host.send!({ cwd: '/w', text: 'hi' })).toEqual({ accepted: false, ack: false })
    expect(calls.some((c) => c[1] === 'send-keys')).toBe(false)
    const agent = scripted((a) => (a[1] === 'list' ? ok(listJson) : ok()))
    expect(makeOttyHost({ runner: agent.runner }).find!({ cwd: '/w' })[0]?.alive).toBe(true)
  })

  test('app not running: no session, nothing throws', () => {
    const { runner } = scripted(() => down)
    const host = makeOttyHost({ runner })
    expect(host.find!({ cwd: '/w' })).toEqual([])
    expect(host.send!({ cwd: '/w', text: 'x' })).toEqual({ accepted: false, ack: false })
    expect(host.focus!({ cwd: '/w' })).toBe(false)
    expect(host.capture!({ cwd: '/w' })).toBeNull()
  })

  test('find, focus, capture', () => {
    const { runner } = scripted((a) => (a[1] === 'list' ? ok(listJson) : ok('screen')))
    const host = makeOttyHost({ runner })
    expect(host.find!({ cwd: '/w' })[0]?.handle).toBe('7')
    expect(host.focus!({ cwd: '/w' })).toBe(true)
    expect(host.capture!({ cwd: '/w' })).toBe('screen')
  })

  test('terminal failure surfaces stderr', () => {
    const { runner } = scripted(() => down)
    expect(() =>
      makeOttyHost({ runner }).terminal!({ cwd: '/w', argv: ['x'], title: 't' }),
    ).toThrow(/Is Otty running/)
  })

  test('availability follows the injected probe', () => {
    expect(makeOttyHost({ available: () => false }).available()).toBe(false)
  })
})

describe('otty addressing by session id', () => {
  const idA = 'aaaaaaaa-1111-4222-8333-444444444444'
  const idB = 'bbbbbbbb-1111-4222-8333-444444444444'
  const tagA = ottyTag('/w', idA)
  const tagB = ottyTag('/w', idB)
  const twoSessions = JSON.stringify([
    { id: 11, title: `PR #1 ${tagA}`, cwd: '/w', foreground_process: 'claude' },
    { id: 12, title: `PR #2 ${tagB}`, cwd: '/w', foreground_process: 'claude' },
    { id: 13, cwd: '/w' },
  ])

  test('the title tag is derived from the session id when there is one, else from the cwd', () => {
    expect(tagA).toBe('[sd-i-aaaaaaaa-111-5ef00c0f]')
    expect(tagA).not.toBe(tagB)
    expect(tagA).not.toBe(ottyTag('/w'))
    expect(ottyCreateArgv({ cwd: '/w', argv: ['claude'], title: 'T', sessionId: idA })).toContain(
      `T ${tagA}`,
    )
  })

  test('ids sharing their first 12 characters or differing only where rewritten get different tags', () => {
    expect(ottyTag('/w', 'build-step-001')).not.toBe(ottyTag('/w', 'build-step-002'))
    expect(ottyTag('/w', 'a.b')).not.toBe(ottyTag('/w', 'a_b'))
    const panes = JSON.stringify([
      { id: 1, title: `x ${ottyTag('/w', 'build-step-001')}`, foreground_process: 'claude' },
      { id: 2, title: `x ${ottyTag('/w', 'build-step-002')}`, foreground_process: 'claude' },
    ])
    expect(parseOttyPanes(panes, '/w', { sessionId: 'build-step-002' })).toEqual(['2'])
  })

  test('two sessions in one cwd resolve to their own panes; a bare cwd pane never matches an id', () => {
    expect(parseOttyPanes(twoSessions, '/w', { sessionId: idA })).toEqual(['11'])
    expect(parseOttyPanes(twoSessions, '/w', { sessionId: idB })).toEqual(['12'])
    expect(parseOttyPanes(twoSessions, '/w', { sessionId: 'cccccccc-1' })).toEqual([])
  })

  test('a tab opened before ids were tagged (cwd tag) is still found from its id', () => {
    expect(parseOttyPanes(listJson, '/w', { sessionId: idA })).toEqual(['7'])
  })

  test('send, focus, capture and close target the pane for the id', () => {
    const { runner, calls } = scripted((a) => (a[1] === 'list' ? ok(twoSessions) : ok('screen')))
    const host = makeOttyHost({ runner })
    const q = { cwd: '/w', sessionId: idB }
    expect(host.send!({ ...q, text: 'hi' }).accepted).toBe(true)
    expect(host.find!(q)[0]?.handle).toBe('12')
    expect(host.focus!(q)).toBe(true)
    expect(host.capture!(q)).toBe('screen')
    expect(host.close!(q)).toBe(true)
    const targeted = calls.filter((c) => c[1] !== 'list').map((c) => c.join(' '))
    expect(targeted.every((c) => c.includes('12'))).toBe(true)
    expect(calls.at(-1)).toEqual(ottyCloseArgv('12'))
  })

  test('close: pane close --yes; false when the app is down or no pane carries the tag', () => {
    expect(ottyCloseArgv('12')).toEqual(['pane', 'close', '--pane', '12', '--yes'])
    expect(makeOttyHost({ runner: scripted(() => down).runner }).close!({ cwd: '/w' })).toBe(false)
    const { runner, calls } = scripted((a) =>
      a[1] === 'list' ? ok(JSON.stringify([{ id: 9, cwd: '/w' }])) : ok(),
    )
    expect(makeOttyHost({ runner }).close!({ cwd: '/w', sessionId: idA })).toBe(false)
    expect(calls.some((c) => c[1] === 'close')).toBe(false)
  })

  test('close with a session id never closes the cwd-tagged tab of a launch that had no id', () => {
    const cwdTagged = JSON.stringify([{ id: 7, title: `T ${ottyTag('/w')}`, cwd: '/w' }])
    const { runner, calls } = scripted((a) => (a[1] === 'list' ? ok(cwdTagged) : ok()))
    const host = makeOttyHost({ runner })
    expect(host.close!({ cwd: '/w', sessionId: idA })).toBe(false)
    expect(calls.some((c) => c[1] === 'close')).toBe(false)
    expect(host.close!({ cwd: '/w' })).toBe(true)
  })
})
