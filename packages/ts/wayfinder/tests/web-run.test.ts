// @vitest-environment jsdom
/**
 * The page's run hand-off: what `requestRun` makes of each answer from
 * `POST /run`, and what the Run button then shows.
 */
import { mountPage } from './dom.ts'

import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { CATALOG_SCHEMA_VERSION, type Catalog, type Task } from '@osdlc/system-model/detect'

import { requestRun, setTokenForTest, signedIn } from '../src/web/api.ts'
import { wireInput } from '../src/web/input.ts'
import { $, state } from '../src/web/state.ts'
import { render } from '../src/web/view.ts'

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

function catalog(): Catalog {
  return {
    kind: 'catalog',
    schemaVersion: CATALOG_SCHEMA_VERSION,
    root: '/tmp/repo',
    generatedAt: new Date(0).toISOString(),
    discovery: 'walk',
    allowExec: false,
    reports: [
      {
        runner: 'make',
        status: 'ok' as const,
        chain: [{ label: 'target', hint: 'The target name.' }],
        tasks: [task('build')],
        skippedForExec: false,
        diagnostics: [],
      },
    ],
  }
}

/** Resolve the microtasks a delegated async click handler runs on. */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

/** Stub fetch: `/run` answers with `answer`, and every URL asked for is kept. */
function stubRun(answer: () => Response | Promise<Response>): string[] {
  const urls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url)
      if (url === '/run') return answer()
      return new Response('{}', { status: 500 })
    }),
  )
  return urls
}

beforeAll(() => {
  mountPage()
  wireInput()
})

beforeEach(() => {
  setTokenForTest('t')
  state.catalog = catalog()
  state.query = ''
  state.runner = 'all'
  state.collapsed = new Set()
  state.focusedId = null
  render()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('requestRun', () => {
  test('a closed connection is gone: the server already handed off the terminal', async () => {
    stubRun(() => Promise.reject(new TypeError('Failed to fetch')))
    expect(await requestRun('make:build')).toEqual({ outcome: 'gone' })
  })

  test('a 409 is taken', async () => {
    stubRun(() => new Response('another run already has the terminal', { status: 409 }))
    expect(await requestRun('make:build')).toEqual({ outcome: 'taken' })
  })

  test('a task that changed fails with its message and hint, and reads the rows again', async () => {
    const urls = stubRun(() =>
      Response.json(
        { code: 'task-changed', message: 'make:build changed', hint: 'list again' },
        { status: 412 },
      ),
    )
    expect(await requestRun('make:build')).toEqual({
      outcome: 'failed',
      detail: 'make:build changed (list again)',
    })
    await vi.waitFor(() => expect(urls).toContain('/api/commands/list'))
  })

  test('another failure does not read the rows again', async () => {
    const urls = stubRun(() =>
      Response.json({ code: 'task-not-found', message: 'no task' }, { status: 404 }),
    )
    expect(await requestRun('make:build')).toEqual({ outcome: 'failed', detail: 'no task' })
    await settle()
    expect(urls).toEqual(['/run'])
  })

  test('a success is handed-off with the command that runs, and sends only the id and args', async () => {
    let sent: unknown
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        sent = JSON.parse(String(init.body))
        return Response.json({ ok: true, display: 'make build', argv: ['make', 'build', 'X=1'] })
      }),
    )
    expect(await requestRun('make:build', ['X=1'])).toEqual({
      outcome: 'handed-off',
      command: 'make build X=1',
    })
    expect(sent).toEqual({ id: 'make:build', args: ['X=1'] })
  })

  test('the handed-off command quotes a word that holds a space', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ ok: true, display: 'make build', argv: ['make', 'X=a b'] }),
      ),
    )
    expect(await requestRun('make:build', ['X=a b'])).toEqual({
      outcome: 'handed-off',
      command: "make 'X=a b'",
    })
  })
})

describe("the row's Run button", () => {
  const button = () => $('out').querySelector('.runbtn') as HTMLButtonElement

  test('a failure is shown escaped, and the button works again', async () => {
    stubRun(() =>
      Response.json({ code: 'spawn', message: '<img src=x onerror=alert(1)>' }, { status: 500 }),
    )
    button().click()
    await vi.waitFor(() => expect($('status').textContent).toContain('run failed:'))
    expect($('status').querySelector('img')).toBeNull()
    expect($('status').textContent).toContain('<img src=x onerror=alert(1)>')
    expect(button().disabled).toBe(false)
  })

  test('a 409 says another run took the terminal, beside the button', async () => {
    stubRun(() => new Response('taken', { status: 409 }))
    button().click()
    await vi.waitFor(() =>
      expect(button().closest('td')?.parentElement?.textContent).toContain(
        'another run already took the terminal',
      ),
    )
    expect(button().disabled).toBe(false)
  })

  // Last of the clicks: a hand-off stops the page's polling for good.
  test('a hand-off replaces the page with the command that runs', async () => {
    stubRun(() => Response.json({ ok: true, display: 'make build', argv: ['make', 'build'] }))
    button().click()
    await vi.waitFor(() => expect(document.querySelector('[data-handoff]')).not.toBeNull())
    expect(document.querySelector('.handoff-cmd')?.textContent).toBe('make build')
  })
})

// Last of all: signing out replaces the page, so no row is left to click.
describe('requestRun signed out', () => {
  test('a 401 signs the tab out and fails', async () => {
    stubRun(() => new Response('unauthorized', { status: 401 }))
    const result = await requestRun('make:build')
    expect(result).toEqual({ outcome: 'failed', detail: 'the server answered 401' })
    expect(signedIn()).toBe(false)
    expect(document.body.textContent).toContain('not signed in')
  })
})
