// @vitest-environment jsdom
/**
 * Step-by-step loading in the page. With nothing on screen, `list` is asked
 * for progress lines and each runner is drawn as its line arrives, with a
 * loading row and tab for each runner still out, in the place its rows
 * and tab will take. Over rows already on screen, the lines only move the
 * status, which names the runners a long refresh still waits on.
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

/** The tab labels in the strip, loading ones included, in order. */
const tabNames = () =>
  [...$('tabs').querySelectorAll('button[data-runner], .tab-loading')].map((el) =>
    (el.textContent ?? '').replace(/[0-9!…\s]+$/, ''),
  )

/** The combined tree's top level, loading rows included, in order. */
const treeNames = () =>
  [...$('out').querySelectorAll(':scope > .node > .head .seg-name, :scope > .loading-row')].map(
    (el) => (el.textContent ?? '').replace(/ loading…$/, ''),
  )

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
    state.expected = 0
    state.order = []
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
    // Not at once: a held catalog usually answers first, with no flash.
    expect($('out').textContent).not.toContain('Loading…')
    await vi.waitFor(() => expect($('out').textContent).toContain('Loading…'))
    expect($('status').textContent).toContain('detecting the project…')

    server.line({ pending: ['just', 'make'], total: 2 })
    await drawn()
    expect($('status').textContent).toContain('loading 2 of 2: just, make')
    expect($('announce').textContent).toBe('loading 2 runners')

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
    expect($('announce').textContent).toBe('2 tasks loaded')
  })

  test('tabs and groups take their final places while they load', async () => {
    const server = streaming()
    const loaded = load({ cached: true })
    await vi.waitFor(() => expect(server.bodies).toHaveLength(1))
    // The server sends the runners in display order: here, not by name.
    server.line({ pending: ['make', 'just', 'zed'], total: 3 })
    await drawn()
    expect(tabNames()).toEqual(['all', 'make', 'just', 'zed'])

    const answer = (runner: string, pending: string[]) =>
      server.line({
        pending,
        total: 3,
        report: report(runner, ['build']),
        cache: fresh(runner),
        unknowns: [],
      })
    answer('zed', ['make', 'just'])
    await drawn()
    expect(tabNames()).toEqual(['all', 'make', 'just', 'zed'])
    expect(treeNames()).toEqual(['make', 'just', 'zed'])
    answer('just', ['make'])
    await drawn()
    expect(tabNames()).toEqual(['all', 'make', 'just', 'zed'])
    expect(treeNames()).toEqual(['make', 'just', 'zed'])
    answer('make', [])
    server.finish(
      doc([report('make', ['build']), report('just', ['build']), report('zed', ['build'])]),
    )
    await loaded
    expect(tabNames()).toEqual(['all', 'make', 'just', 'zed'])
    expect(treeNames()).toEqual(['make', 'just', 'zed'])
  })

  test('a runner whose report is too large for a line stays loading until the document', async () => {
    const server = streaming()
    const loaded = load({ cached: true })
    await vi.waitFor(() => expect(server.bodies).toHaveLength(1))
    server.line({ pending: ['big'], total: 1 })
    server.line({ pending: [], total: 1, omitted: 'big' })
    await drawn()
    expect($('tabs').querySelector('.tab-loading')?.textContent).toContain('big')
    expect($('status').textContent).toContain('loading…')
    server.finish(doc([report('big', ['build'])]))
    await loaded
    expect($('tabs').querySelector('.tab-loading')).toBeNull()
    expect($('out').textContent).toContain('build')
  })

  test('a repository with no runners loads to an empty view', async () => {
    const server = streaming()
    const loaded = load({ cached: true })
    await vi.waitFor(() => expect(server.bodies).toHaveLength(1))
    server.line({ pending: [], total: 0 })
    await drawn()
    expect($('tabs').querySelector('.tab-loading')).toBeNull()
    expect($('status').textContent).toContain('loading…')
    server.finish(doc([]))
    await loaded
    expect($('out').textContent).toContain('Nothing collected.')
    expect($('announce').textContent).toBe('0 tasks loaded')
  })

  test('a failed runner is counted when the load ends', async () => {
    const server = streaming()
    const loaded = load({ cached: true })
    await vi.waitFor(() => expect(server.bodies).toHaveLength(1))
    const boom: RunnerReport = {
      ...report('boom', []),
      status: 'error',
      diagnostics: [{ severity: 'error', message: 'boom exploded' }],
    }
    server.line({ pending: ['boom'], total: 1 })
    server.line({ pending: [], total: 1, report: boom, cache: fresh('boom'), unknowns: [] })
    await drawn()
    expect($('out').textContent).toContain('boom: boom exploded')
    server.finish(doc([boom]))
    await loaded
    expect($('announce').textContent).toBe('0 tasks loaded, 1 runner failed')
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

  test('over rows on screen, the status says refreshing', async () => {
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
    expect(bodies[1]).toEqual({ join: true, progress: true })
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

  test('a long refresh names the runners it still waits on', async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify(doc([report('hang', ['old'])])), {
          headers: { 'content-type': 'application/json' },
        }),
      )) as unknown as typeof fetch
    await load({ cached: true })
    const server = streaming()
    const poll = load({ join: true })
    await vi.waitFor(() => expect(server.bodies).toHaveLength(1))
    server.line({ pending: ['make', 'hang'], total: 2 })
    await drawn()
    expect($('status').textContent).toContain('refreshing…')
    expect($('status').textContent).not.toContain('waiting on')
    state.loadStarted = Date.now() - 5000
    server.line({
      pending: ['hang'],
      total: 2,
      report: report('make', ['new']),
      cache: fresh('make'),
      unknowns: [],
    })
    await vi.waitFor(() => expect($('status').textContent).toContain('refreshing… waiting on hang'))
    // A refresh draws no rows from its lines.
    expect($('out').textContent).not.toContain('new')
    server.finish(doc([report('hang', ['old']), report('make', ['new'])]))
    await poll
    expect($('status').textContent).not.toContain('refreshing')
  })
})
