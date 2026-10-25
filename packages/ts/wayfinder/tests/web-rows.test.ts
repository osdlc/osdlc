// @vitest-environment jsdom
/**
 * What a row and the help say: each copy button has its own name, a task
 * whose parameters could not be read is marked and asks for arguments, and
 * the help lists the shared key table.
 */
import { mountPage } from './dom.ts'

import { beforeEach, describe, expect, test } from 'vitest'
import { CATALOG_SCHEMA_VERSION, type Catalog, type Task } from '@osdlc/system-model/detect'

import { WEB_KEYS } from '../src/keys.ts'
import { parametersUnknownLabel } from '../src/vocabulary.ts'
import { $, state } from '../src/web/state.ts'
import { helpHtml, render, showRunBar } from '../src/web/view.ts'

function task(name: string, over: Partial<Task> = {}): Task {
  return {
    id: `just:${name}`,
    runner: 'just',
    path: ['just', name],
    argv: ['just', name],
    cwd: '.',
    display: `just ${name}`,
    parameters: [],
    source: 'justfile',
    origin: 'declared',
    tags: [],
    persistent: { value: false, declared: false },
    executes: 'local',
    ...over,
  }
}

function catalog(tasks: Task[]): Catalog {
  return {
    kind: 'catalog',
    schemaVersion: CATALOG_SCHEMA_VERSION,
    root: '/tmp/repo',
    generatedAt: new Date(0).toISOString(),
    discovery: 'walk',
    allowExec: false,
    reports: [
      {
        runner: 'just',
        status: 'ok',
        chain: [{ label: 'recipe', hint: 'The recipe name.' }],
        tasks,
        skippedForExec: false,
        diagnostics: [],
      },
    ],
  }
}

beforeEach(() => {
  mountPage()
  state.query = ''
  state.runner = 'all'
  state.collapsed = new Set()
  state.enabled = null
})

describe('a row', () => {
  test('each copy button names what it copies', () => {
    state.catalog = catalog([task('build'), task('test')])
    render()
    const names = [...document.querySelectorAll('#out .copy')].map((b) =>
      b.getAttribute('aria-label'),
    )
    expect(names).toEqual(['Copy just build', 'Copy just test'])
  })

  test('a task whose parameters could not be read is marked with the reason', () => {
    state.catalog = catalog([task('deploy', { parametersUnknown: 'exec-withheld' }), task('lint')])
    render()
    const marks = document.querySelectorAll('#out .ind-params')
    expect(marks).toHaveLength(1)
    expect(marks[0]!.getAttribute('title')).toBe(parametersUnknownLabel('exec-withheld'))
  })
})

describe('the run bar', () => {
  test('says the arguments are optional when the parameters could not be read', () => {
    showRunBar(task('deploy', { parametersUnknown: 'tool-missing' }))
    expect($('runbar').getAttribute('aria-label')).toBe('Arguments for just deploy')
    expect($('runbar').textContent).toContain(
      parametersUnknownLabel('tool-missing') + '; arguments are optional',
    )
  })
})

describe('the help', () => {
  test('lists every key in the shared table', () => {
    const help = document.createElement('div')
    help.innerHTML = helpHtml()
    const rows = [...help.querySelectorAll('dl.keys dd')].map((d) => d.textContent)
    expect(rows).toEqual(WEB_KEYS.map((k) => k.action))
  })

  test('covers the controls the page has', () => {
    const help = document.createElement('div')
    help.innerHTML = helpHtml()
    const terms = [...help.querySelectorAll('dt, h3')].map((d) => d.textContent)
    for (const term of ['Scope', 'Services', 'Declared', 'Runners', 'Run and Copy', 'Settings']) {
      expect(terms).toContain(term)
    }
  })
})
