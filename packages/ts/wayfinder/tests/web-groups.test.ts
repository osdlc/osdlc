// @vitest-environment jsdom
/** The page's tab bar and chains: task runners first, then each synthesized group, by its label. */
import { mountPage } from './dom.ts'

import { beforeAll, expect, test } from 'vitest'
import { CATALOG_SCHEMA_VERSION, type Catalog, type Task } from '@osdlc/system-model/detect'

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
    kind: 'catalog',
    schemaVersion: CATALOG_SCHEMA_VERSION,
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
  // Each group here has one tab that already says its name, so no label repeats it.
  expect([...bar.querySelectorAll('.tabgroup')].map((e) => e.textContent)).toEqual([])
  const text = bar.textContent ?? ''
  const at = (s: string) => text.indexOf(s)
  expect(at('make')).toBeLessThan(at('dependencies'))
  expect(at('just')).toBeLessThan(at('dependencies'))
  expect(at('dependencies')).toBeLessThan(at('git hooks'))
  // Labels, never runner ids, wherever a person reads them.
  expect(text).not.toContain('package-manager')
  const info = bar.querySelector('[data-info-runner="package-manager"]')
  expect(info?.getAttribute('aria-label')).toBe('About dependencies')
})

test('a search hit names a group runner by its label in its chain', () => {
  state.catalog = catalog(['package-manager'])
  state.runner = 'all'
  state.query = 'a'
  render()
  const name = $('out').querySelector('td.name')!
  expect(name.textContent).toContain('dependencies')
  expect(name.textContent).not.toContain('package-manager')
  expect(name.getAttribute('title')).not.toContain('package-manager')
  state.query = ''
})
