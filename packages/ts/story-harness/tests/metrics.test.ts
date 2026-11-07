// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FIRST_ROWS_MARK, MOUNT_MARK, storyMetrics } from '../src/browser/index.ts'

const markNames = () => performance.getEntriesByType('mark').map((m) => m.name)

/** A manual frame clock: `frame()` runs the callbacks queued so far. */
function stubFrames() {
  let queue = new Map<number, FrameRequestCallback>()
  let next = 0
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    queue.set(++next, cb)
    return next
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => queue.delete(id))
  return {
    frame() {
      const run = queue
      queue = new Map()
      for (const cb of run.values()) cb(performance.now())
    },
    pending: () => queue.size,
  }
}

describe('storyMetrics', () => {
  beforeEach(() => {
    performance.clearMarks()
    document.body.innerHTML = '<ul id="list"></ul>'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete window.__storyHarness
  })

  it('marks story:mount at once and story:first-rows once rows are painted', async () => {
    const frames = stubFrames()
    const harness = storyMetrics({ rows: '#list li' })
    expect(markNames()).toEqual([MOUNT_MARK])

    frames.frame()
    frames.frame()
    expect(markNames()).toEqual([MOUNT_MARK])

    document.getElementById('list')!.innerHTML = '<li>a</li><li>b</li>'
    frames.frame() // rows seen
    expect(markNames()).toEqual([MOUNT_MARK])
    frames.frame() // the painted frame
    expect(markNames()).toEqual([MOUNT_MARK, FIRST_ROWS_MARK])

    const at = await harness.ready
    expect(at).toBe(performance.getEntriesByName(FIRST_ROWS_MARK)[0]!.startTime)
    frames.frame()
    expect(markNames()).toEqual([MOUNT_MARK, FIRST_ROWS_MARK])
  })

  it('exposes window.__storyHarness with the current row count', () => {
    stubFrames()
    storyMetrics({ rows: '#list li' })
    expect(window.__storyHarness!.rows()).toBe(0)
    document.getElementById('list')!.innerHTML = '<li>a</li><li>b</li><li>c</li>'
    expect(window.__storyHarness!.rows()).toBe(3)
  })

  it('accepts a counting function', () => {
    stubFrames()
    let n = 7
    storyMetrics({ rows: () => n })
    expect(window.__storyHarness!.rows()).toBe(7)
    n = 9
    expect(window.__storyHarness!.rows()).toBe(9)
  })

  it('lists every story: mark, its own included, and no others', () => {
    stubFrames()
    storyMetrics({ rows: '#list li' })
    performance.mark('story:expand-start')
    performance.mark('other')
    expect(window.__storyHarness!.marks().map((m) => m.name)).toEqual([
      MOUNT_MARK,
      'story:expand-start',
    ])
  })

  it('stops the first loop when called again before rows appear', () => {
    const frames = stubFrames()
    storyMetrics({ rows: '#list li' })
    frames.frame()
    storyMetrics({ rows: '#list li' })
    expect(frames.pending()).toBe(1)

    document.getElementById('list')!.innerHTML = '<li>a</li>'
    frames.frame()
    frames.frame()
    frames.frame()
    expect(markNames()).toEqual([MOUNT_MARK, FIRST_ROWS_MARK])
    expect(frames.pending()).toBe(0)
  })
})
