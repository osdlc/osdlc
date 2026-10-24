// @vitest-environment jsdom
/** The page's tab bar: task runners first, then a labelled break before each synthesized group. */
import { mountPage } from './dom.ts'

import { beforeAll, expect, test } from 'vitest'
import type { Catalog, Task } from '@osdlc/system-model/detect'

import { $, state } from '../src/web/state.ts'
import { render } from '../src/web/view.ts'

function task(runner: string, name: string): Task {
  return {
    id: `${runner}:${name}`,
    runner,
    path: [runner, name],
    argv: [runner, name],
    cwd: '.',
    display: `${runner} ${name}`,
    parameters: [],
    source: 'x',
    origin: 'declared',
    tags: [],
    persistent: { value: false, declared: false },
    executes: 'local',
  }
}

function catalog(runners: string[]): Catalog {
  return {
    root: '/tmp/repo',
    generatedAt: new Date(0).toISOString(),
    discovery: 'walk',
    allowExec: false,
    reports: runners.map((runner) => ({
      runner,
      status: 'ok' as const,
      chain: [{ label: 'role', hint: 'h' }],
      tasks: [task(runner, 'a')],
      skippedForExec: false,
      diagnostics: [],
    })),
  }
}

beforeAll(() => {
  mountPage()
})

test('groups the tabs in display order, whatever order the reports came in', () => {
  state.catalog = catalog(['hook-manager', 'make', 'package-manager', 'just'])
  state.query = ''
  state.runner = 'all'
  state.collapsed = new Set()
  render()
  const bar = $('tabs')
  expect([...bar.querySelectorAll('.tabgroup')].map((e) => e.textContent)).toEqual([
    'Dependencies',
    'Git hooks',
  ])
  const text = bar.textContent ?? ''
  const at = (s: string) => text.indexOf(s)
  expect(at('make')).toBeLessThan(at('Dependencies'))
  expect(at('just')).toBeLessThan(at('Dependencies'))
  expect(at('dependencies')).toBeGreaterThan(at('Dependencies'))
  expect(at('git hooks')).toBeGreaterThan(at('Git hooks'))
})
