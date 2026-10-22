import { describe, expect, test } from 'vitest'

import { runStateForStatus, type AgentStatus } from '../src/status.ts'

describe('runStateForStatus', () => {
  test('maps every hook status to the state it reports', () => {
    const table: [AgentStatus, string][] = [
      ['delivered', 'running'],
      ['working', 'running'],
      ['idle', 'idle'],
      ['needs_input', 'waiting_for_input'],
      ['ended', 'ended'],
    ]
    for (const [status, state] of table)
      expect([status, runStateForStatus(status)]).toEqual([status, state])
  })
})
