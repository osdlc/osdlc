/**
 * The tmux host's wait ([[T-F9EJ]]): a visible run's session is named after the run, the launch
 * holds until the pane's process exits and reports its status, and the run's deadline kills the
 * session. Driven through a doubled command seam; nothing real spawns.
 */

import { describe, expect, test } from 'vitest'

import type { CommandResult, CommandRunner } from '@osdlc/command-seam'

import type { CommandRequest } from '../src/contract.ts'
import { WAIT_TIMEOUT_EXIT } from '../src/contract.ts'
import { makeTmuxHost, tmuxCreateArgv, tmuxRunSessionName } from '../src/hosts/tmux.ts'

const ok = (stdout = ''): CommandResult => ({ exitCode: 0, stdout, stderr: '' })

/** A runner answering each pane-status look from `panes` in turn, recording every argv. */
function tmuxDouble(panes: CommandResult[]): { runner: CommandRunner; calls: string[][] } {
  const calls: string[][] = []
  const runner: CommandRunner = {
    run(argv) {
      calls.push([...argv])
      if (argv[0] === 'display-message') return panes.shift() ?? ok('0 ')
      return ok()
    },
  }
  return { runner, calls }
}

const waiting = (timeoutMs?: number): CommandRequest => ({
  cwd: '/w',
  argv: ['claude', 'go'],
  title: 't',
  sessionId: '0198aaaa-bbbb-cccc',
  wait: { runId: 'r-ABC123', timeoutMs },
})

describe('tmux visible launch', () => {
  test('the session name contains the run id and survives tmux name rules', () => {
    expect(tmuxRunSessionName('r-ABC123', '0198aaaa-bbbb-cccc')).toBe(
      'sd-r-ABC123-0198aaaa-bbb-3b8f6a5d',
    )
    expect(tmuxRunSessionName('r.1:2')).toBe('sd-r_1_2')
    const argv = tmuxCreateArgv(waiting())
    expect(argv.slice(0, 4)).toEqual([
      'new-session',
      '-d',
      '-s',
      'sd-r-ABC123-0198aaaa-bbb-3b8f6a5d',
    ])
  })

  test('remain-on-exit is set in the same invocation as the create', () => {
    const argv = tmuxCreateArgv(waiting())
    expect(argv.slice(-6)).toEqual([
      ';',
      'set-option',
      '-t',
      'sd-r-ABC123-0198aaaa-bbb-3b8f6a5d',
      'remain-on-exit',
      'on',
    ])
  })

  test('a launch without a wait is unchanged: cwd-hash name, no remain-on-exit, returns at once', () => {
    const { runner, calls } = tmuxDouble([])
    const host = makeTmuxHost({ runner })
    const req: CommandRequest = { cwd: '/w', argv: ['claude'], title: 't' }
    expect(host.terminal!(req)).toBe(0)
    expect(calls).toHaveLength(1)
    expect(calls[0]).not.toContain('remain-on-exit')
    expect(calls[0]![3]).toMatch(/^sd-[0-9a-f]{12}$/)
  })

  test('holds until the pane process exits, then returns its status and clears the session', () => {
    const { runner, calls } = tmuxDouble([ok('0 '), ok('0 '), ok('1 3')])
    const sleeps: number[] = []
    const host = makeTmuxHost({ runner, sleep: (ms) => void sleeps.push(ms), now: () => 0 })
    expect(host.terminal!(waiting())).toBe(3)
    expect(sleeps).toHaveLength(2)
    expect(calls.filter((c) => c[0] === 'display-message')).toHaveLength(3)
    expect(calls.at(-1)).toEqual(['kill-session', '-t', '=sd-r-ABC123-0198aaaa-bbb-3b8f6a5d'])
  })

  test('at the deadline the session is killed and the launch reports the timeout code', () => {
    const { runner, calls } = tmuxDouble([])
    let clock = 0
    const host = makeTmuxHost({
      runner,
      sleep: (ms) => void (clock += ms),
      now: () => clock,
    })
    let fired = 0
    const req = waiting(1200)
    req.wait!.onDeadline = () => void (fired += 1)
    expect(host.terminal!(req)).toBe(WAIT_TIMEOUT_EXIT)
    expect(fired).toBe(1)
    expect(calls.at(-1)).toEqual(['kill-session', '-t', '=sd-r-ABC123-0198aaaa-bbb-3b8f6a5d'])
  })

  test('a process that exits with the timeout code itself does not fire the deadline hook', () => {
    const { runner } = tmuxDouble([ok('1 124')])
    const host = makeTmuxHost({ runner, sleep: () => {}, now: () => 0 })
    let fired = 0
    const req = waiting(1200)
    req.wait!.onDeadline = () => void (fired += 1)
    expect(host.terminal!(req)).toBe(WAIT_TIMEOUT_EXIT)
    expect(fired).toBe(0)
  })

  test('a session closed from outside reports failure instead of hanging', () => {
    const calls: string[][] = []
    const runner: CommandRunner = {
      run: (argv) => {
        calls.push(argv)
        return argv[0] === 'display-message' || argv[0] === 'has-session'
          ? { exitCode: 1, stdout: '', stderr: 'no session' }
          : ok()
      },
    }
    expect(makeTmuxHost({ runner, sleep: () => {} }).terminal!(waiting())).toBe(1)
    // Gone already: nothing to kill.
    expect(calls.some((c) => c[0] === 'kill-session')).toBe(false)
  })

  test('a status poll that fails while the session lives is retried, and the real status wins', () => {
    const replies: CommandResult[] = [{ exitCode: 1, stdout: '', stderr: 'timed out' }, ok('1 7\n')]
    const runner: CommandRunner = {
      run: (argv) => (argv[0] === 'display-message' ? replies.shift()! : ok()),
    }
    expect(makeTmuxHost({ runner, sleep: () => {} }).terminal!(waiting())).toBe(7)
  })

  test('status polls that keep failing while the session lives give up and kill it', () => {
    const calls: string[][] = []
    const runner: CommandRunner = {
      run: (argv) => {
        calls.push(argv)
        return argv[0] === 'display-message'
          ? { exitCode: 1, stdout: '', stderr: 'timed out' }
          : ok()
      },
    }
    expect(makeTmuxHost({ runner, sleep: () => {} }).terminal!(waiting())).toBe(1)
    expect(calls.filter((c) => c[0] === 'display-message')).toHaveLength(3)
    expect(calls.at(-1)?.[0]).toBe('kill-session')
  })
})
