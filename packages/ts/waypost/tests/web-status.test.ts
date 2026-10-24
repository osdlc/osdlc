// @vitest-environment jsdom
/**
 * The count on the status strip after a poll that changed nothing.
 *
 * The changed path counts the rows it just built. The unchanged path has to
 * count the rows already on screen instead — and "on screen" means the task
 * list, not every table in the document. The settings dialog draws its runner
 * list as a table too, so a document-wide sweep reports more commands than the
 * page is showing while it is open.
 */
import { mountPage } from './dom.ts'

import { afterAll, beforeEach, describe, expect, test } from 'vitest'
import type { Catalog, Task } from '@osdlc/system-model/detect'

import { load } from '../src/web/api.ts'
import { $, state } from '../src/web/state.ts'

function task(name: string): Task {
  return {
    id: `make:${name}`,
    runner: 'make',
    path: ['make', name],
    argv: ['make', name],
    cwd: '.',
    display: `make ${name}`,
    parameters: [],
    source: 'Makefile',
    origin: 'declared',
    tags: [],
    persistent: { value: false, declared: false },
    executes: 'local',
  }
}

function catalog(names: string[]): Catalog {
  return {
    root: '/tmp/repo',
    generatedAt: new Date(0).toISOString(),
    discovery: 'walk',
    allowExec: false,
    reports: [
      {
        runner: 'make',
        status: 'ok',
        chain: [{ label: 'target', hint: 'The target name.' }],
        tasks: names.map(task),
        skippedForExec: false,
        diagnostics: [],
      },
    ],
  }
}

describe('the unchanged-poll status line', () => {
  // Restored so a stubbed `fetch` never outlives this suite.
  const nativeFetch = globalThis.fetch
  afterAll(() => {
    globalThis.fetch = nativeFetch
  })

  beforeEach(() => {
    mountPage()
    state.catalog = null
    state.fingerprint = ''
    state.loading = false
    state.query = ''
    state.runner = 'all'
    state.collapsed = new Set()
    const body = catalog(['build', 'lint'])
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          headers: { 'content-type': 'application/json' },
        }),
      )) as unknown as typeof fetch
  })

  test('counts the commands on screen, not every table row in the document', async () => {
    await load(false)
    expect($('status').textContent).toContain('2 of 2')

    // The settings dialog is open behind the poll, and it draws its runner
    // list as a table of its own.
    $('settings-body').innerHTML =
      '<table class="set-table"><tbody><tr><td>a</td></tr><tr><td>b</td></tr>' +
      '<tr><td>c</td></tr></tbody></table>'

    await load(false)
    expect($('status').textContent).toContain('2 of 2')
  })
})
