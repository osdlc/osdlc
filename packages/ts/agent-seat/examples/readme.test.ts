/**
 * The README's quick start, run through the package name with a recording
 * command runner standing in for tmux.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { CommandRunner } from '@osdlc/command-seam'
import { expect, test } from 'vitest'

import { hostRegistry, makeTmuxHost, requirePart } from '@osdlc/agent-seat'

test('the quick start opens a claude session in tmux', () => {
  const calls: string[][] = []
  const runner: CommandRunner = {
    run: (argv) => {
      calls.push(argv)
      return { exitCode: 0, stdout: '', stderr: '' }
    },
  }
  const hosts = {
    ...hostRegistry({ runtimeDir: mkdtempSync(join(tmpdir(), 'agent-seat-readme-')) }),
    tmux: makeTmuxHost({ runner, available: () => true }),
  }

  const tmux = hosts.tmux
  expect(tmux.available()).toBe(true)
  const open = requirePart(tmux, 'session')
  const { exitCode } = open({
    cwd: process.cwd(),
    harness: 'claude',
    binary: 'claude',
    prompt: 'Summarise the open TODOs in this repository.',
    title: 'todo review',
    sessionId: 'todo-review',
  })

  expect(exitCode).toBe(0)
  const created = calls.find((argv) => argv[0] === 'new-session')!
  expect(created).toContain('-c')
  expect(created.join(' ')).toContain('claude')
  expect(created.join(' ')).toContain('Summarise the open TODOs in this repository.')
})

test('a host without a part says so', () => {
  const hosts = hostRegistry({ runtimeDir: mkdtempSync(join(tmpdir(), 'agent-seat-readme-')) })
  expect(() => requirePart(hosts.terminal, 'send')).toThrow(/terminal/)
})
