// @vitest-environment jsdom
/**
 * Step-by-step loading in the page. With nothing on screen, `list` is asked
 * for progress lines and each runner is drawn as its line arrives, with a
 * loading row and tab for each runner still out. Over rows already on
 * screen, the page asks for no lines and says it is refreshing.
 */
import { mountPage } from './dom.ts'

import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { CATALOG_SCHEMA_VERSION, type RunnerReport, type Task } from '@osdlc/system-model/detect'

import { load } from '../src/web/api.ts'
import { $, state } from '../src/web/state.ts'

function task(runner: string, name: string): Task {
  return {
    id: `${runner}:${name}`,
    runner,
    path: [runner, name],
    argv: [runner, name],
    cwd: '.',
    display: `${runner} ${name}`,
    parameters: [],
    source: 'Makefile',
    origin: 'declared',
    tags: [],
    persistent: { value: false, declared: false },
    executes: 'local',
  }
}

function report(runner: string, names: string[]): RunnerReport {
  return {
    runner,
    status: 'ok',
    chain: [{ label: 'target', hint: 'The target name.' }],
    tasks: names.map((n) => task(runner, n)),
    skippedForExec: false,
    diagnostics: [],
  }
}

function doc(reports: RunnerReport[]) {
  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    kind: 'catalog',
    root: '/tmp/repo',
    generatedAt: new Date(0).toISOString(),
    discovery: 'walk',
    allowExec: false,
    source: 'fresh',
    storedAt: null,
    reports,
    groups: [],
    skills: [],
    cache: [],
    unknowns: [],
    trustedTools: [],
    filter: {},
  }
}

const fresh = (runner: string) => ({
  runner,
  state: 'fresh',
  ageMs: 0,
  estimateMs: 5,
  slow: false,
})

/** A streamed answer the test writes line by line, and the request bodies sent. */
function streaming() {
  let push: (line: object) => void = () => {}
  let end: () => void = () => {}
  const bodies: Record<string, unknown>[] = []
  const accepts: string[] = []
  globalThis.fetch = ((_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>)
    accepts.push(new Headers(init.headers).get('accept') ?? '')
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        push = (line) => controller.enqueue(encoder.encode(JSON.stringify(line) + '\n'))
        end = () => controller.close()
      },
    })
    return Promise.resolve(
      new Response(body, { headers: { 'content-type': 'application/x-ndjson' } }),
    )
  }) as unknown as typeof fetch
  return {
    bodies,
    accepts,
    line: (line: object) => push({ schemaVersion: 1, kind: 'catalog-progress', ...line }),
    finish: (last: object) => {
      push(last)
      end()
    },
  }
}

/** Wait for the coalesced render of the lines sent so far. */
const drawn = () => new Promise((resolve) => setTimeout(resolve, 80))

describe('step-by-step loading in the page', () => {
  const nativeFetch = globalThis.fetch
  afterAll(() => {
    globalThis.fetch = nativeFetch
  })

  beforeEach(() => {
    mountPage()
    state.catalog = null
    state.fingerprint = ''
    state.loading = false
    state.live = false
    state.pending = []
    state.enabled = null
    state.knownRunners = new Set()
    state.query = ''
    state.runner = 'all'
    state.collapsed = new Set()
  })

  test('with nothing on screen, each runner is drawn as it answers', async () => {
    const server = streaming()
    const loaded = load({ cached: true })
    await vi.waitFor(() => expect(server.bodies).toHaveLength(1))
    expect(server.bodies[0]).toEqual({ cached: true, progress: true })
    expect(server.accepts[0]).toBe('application/x-ndjson')
    expect($('out').textContent).toContain('Loading…')

    server.line({ pending: ['just', 'make'], total: 2 })
    await drawn()
    expect($('status').textContent).toContain('loading 2 of 2: just, make')

    server.line({
      pending: ['just'],
      total: 2,
      report: report('make', ['build']),
      cache: fresh('make'),
      unknowns: [],
    })
    await drawn()
    expect($('status').textContent).toContain('loading 1 of 2: just')
    expect($('out').textContent).toContain('build')
    expect($('out').querySelector('.loading-row')?.textContent).toContain('just')
    expect($('tabs').querySelector('.tab-loading')?.textContent).toContain('just')
    expect($('tabs').textContent).toContain('make')

    server.line({
      pending: [],
      total: 2,
      report: report('just', ['test']),
      cache: fresh('just'),
      unknowns: [],
    })
    server.finish(doc([report('just', ['test']), report('make', ['build'])]))
    await loaded
    expect(state.live).toBe(false)
    expect($('out').querySelector('.loading-row')).toBeNull()
    expect($('tabs').querySelector('.tab-loading')).toBeNull()
    expect($('status').textContent).toContain('checked')
    expect($('status').textContent).not.toContain('loading')
    expect(state.catalog?.source).toBe('fresh')
  })

  test('a failure after the first line keeps the rows and says it failed', async () => {
    const server = streaming()
    const loaded = load({ cached: true })
    await vi.waitFor(() => expect(server.bodies).toHaveLength(1))
    server.line({ pending: ['make'], total: 1 })
    server.finish({ schemaVersion: 1, kind: 'error', exit: 1, message: 'moon failed' })
    await loaded
    expect($('status').textContent).toContain('refresh failed: moon failed')
    expect(state.loading).toBe(false)
  })

  test('over rows on screen, no lines are asked for and the status says refreshing', async () => {
    let answer: (r: Response) => void = () => {}
    const bodies: Record<string, unknown>[] = []
    globalThis.fetch = ((_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>)
      if (bodies.length === 1) {
        return Promise.resolve(
          new Response(JSON.stringify(doc([report('make', ['old'])])), {
            headers: { 'content-type': 'application/json' },
          }),
        )
      }
      return new Promise<Response>((ok) => (answer = ok))
    }) as unknown as typeof fetch
    await load({ cached: true })
    const poll = load({ join: true })
    await vi.waitFor(() => expect(bodies).toHaveLength(2))
    expect(bodies[1]).toEqual({ join: true })
    expect($('status').textContent).toContain('refreshing…')
    expect($('out').textContent).toContain('old')
    answer(
      new Response(JSON.stringify(doc([report('make', ['new'])])), {
        headers: { 'content-type': 'application/json' },
      }),
    )
    await poll
    expect($('out').textContent).toContain('new')
    expect($('status').textContent).not.toContain('refreshing')
  })
})
