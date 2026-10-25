/**
 * Every interactive action has a command (the CLI standard's rule 8): each
 * command and flag `SURFACE_ACTIONS` names must exist in the tree.
 */
import { describe, expect, test } from 'vitest'

import { SURFACE_ACTIONS } from '../src/actions.ts'
import { createWayApp } from '../src/commands/index.ts'
import { GLOBALS } from '../src/commands/shared.ts'

describe('the action table', () => {
  const { app } = createWayApp({ home: '/' })
  const paths = app.paths().map((p) => p.join(' '))

  test.each(SURFACE_ACTIONS.map((a) => [a.action, a] as const))('%s has its command', (_, a) => {
    expect(paths).toContain(a.command.join(' '))
    const properties = Object.keys(
      (app.argsSchema(a.command) as { properties?: Record<string, unknown> }).properties ?? {},
    )
    for (const flag of a.flags) expect([...properties, ...Object.keys(GLOBALS)]).toContain(flag)
  })

  test('every action is on at least one surface', () => {
    for (const a of SURFACE_ACTIONS) expect(a.tui !== null || a.web !== null).toBe(true)
  })
})
