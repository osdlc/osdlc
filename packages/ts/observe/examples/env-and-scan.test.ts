/**
 * The tags a launched agent carries, the process scan that reads them back, and
 * the session state a harness hook status reports.
 */

import type { CommandRunner } from '@osdlc/command-seam'
import { describe, expect, test } from 'vitest'

import {
  AUTHOR_ENV_VAR,
  authorFromEnv,
  liveSessionIds,
  PINNED_CMD_ENV_VAR,
  processScanSupported,
  PROJECT_ROOT_ENV_VAR,
  runStateForStatus,
  scanTaggedProcesses,
  SESSION_ID_RE,
  sessionEnv,
  TASK_ENV_VAR,
  type AgentStatus,
  type LiveIds,
  type SessionEnv,
  type TaggedProcess,
} from '@osdlc/observe/session'

describe('the env tags', () => {
  test('sessionEnv sets every tag, so nothing leaks from a parent session', () => {
    const id = crypto.randomUUID()

    const env: SessionEnv = sessionEnv({
      id,
      task: 'issue-42',
      projectRoot: '/work/repo',
      pin: 'tool@1.2.0',
      author: 'aider/model-a@high',
      machine: 'm-0123456789abcdef',
    })

    expect(SESSION_ID_RE.test(id)).toBe(true)
    expect(env).toMatchObject({
      OBSERVE_SESSION: id,
      OBSERVE_TASK: 'issue-42',
      OBSERVE_RUN: '',
      OBSERVE_INVOCATION: '',
      SDLC_SESSION: id, // the legacy name, for readers older than 0.3.3
    })
    expect([env[TASK_ENV_VAR], env[PROJECT_ROOT_ENV_VAR], env[PINNED_CMD_ENV_VAR]]).toEqual([
      'issue-42',
      '/work/repo',
      'tool@1.2.0',
    ])
    expect(env[AUTHOR_ENV_VAR]).toBe('aider/model-a@high')
    expect(authorFromEnv(env)).toBe('aider/model-a@high')
  })
})

describe('the process scan', () => {
  test('finds the processes that carry a session tag', () => {
    // `ps` as macOS prints it: the command line, then the environment.
    const ps: CommandRunner = {
      run: (argv) => ({
        exitCode: 0,
        stderr: '',
        stdout: argv.includes('-E')
          ? '  4242 aider --yes OBSERVE_SESSION=s-1 OBSERVE_TASK=issue-42 HOME=/home/ada\n'
          : '  4242 aider --yes\n',
      }),
    }

    const found: TaggedProcess[] | null = scanTaggedProcesses(ps, { platform: 'darwin' })

    expect(found).toEqual([{ pid: 4242, sessionId: 's-1', task: 'issue-42' }])
  })

  test('null means it could not tell, which is not "none running"', () => {
    expect(processScanSupported('win32')).toBe(false)
    expect(
      scanTaggedProcesses(
        { run: () => ({ exitCode: 0, stdout: '', stderr: '' }) },
        { platform: 'win32' },
      ),
    ).toBeNull()
  })

  test('the ids of the sessions running on this machine', () => {
    const live: LiveIds = liveSessionIds

    const ids = live()

    expect(ids === null || ids instanceof Set).toBe(true)
  })
})

describe('hook status', () => {
  test('a harness maps its hook events to a status, and the status to a state', () => {
    const status: AgentStatus = 'needs_input'

    expect(runStateForStatus(status)).toBe('waiting_for_input')
  })
})
