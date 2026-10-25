/**
 * The `way serve` terminal reader. A background job that reads its terminal
 * is stopped by `SIGTTIN`, so the reader reads only in the foreground.
 */

import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

import { describe, expect, test, vi } from 'vitest'

import {
  foregroundFromPs,
  inForeground,
  readTerminalLines,
  type JobSignals,
} from '../src/serve/terminal-input.ts'

/** Job-control signals sent by hand, with a count of suspends. */
function fakeSignals(): JobSignals & { emit(signal: string): void; suspends: number } {
  const events = new EventEmitter()
  const fake = {
    suspends: 0,
    on: (signal: string, listener: () => void) => events.on(signal, listener),
    off: (signal: string, listener: () => void) => events.off(signal, listener),
    suspend: () => {
      fake.suspends += 1
    },
    emit: (signal: string) => events.emit(signal),
  }
  return fake
}

describe('foregroundFromPs', () => {
  test.each([
    ['  4242  4242\n', true],
    ['4242 4243', false],
    ['0 4242', false],
    ['-1 4242', false],
    ['', false],
    ['4242', false],
    ['4242 4242 1', false],
  ])('%j is %s', (out, expected) => {
    expect(foregroundFromPs(out)).toBe(expected)
  })

  test.skipIf(process.platform === 'win32')(
    'a test run, which has no terminal, is not in the foreground',
    async () => {
      expect(await inForeground()).toBe(process.stdin.isTTY === true)
    },
  )
})

describe('readTerminalLines', () => {
  test('in the foreground each Enter calls back', async () => {
    const input = new PassThrough()
    const onLine = vi.fn()
    const lines = readTerminalLines(input, onLine, {
      foreground: async () => true,
      signals: null,
    })
    expect(await lines.ready).toBe(true)
    input.write('x')
    input.write('\n')
    await vi.waitFor(() => expect(onLine).toHaveBeenCalledTimes(1))
    lines.stop()
    expect(input.listenerCount('data')).toBe(0)
  })

  test('in the background the input is not read', async () => {
    const input = new PassThrough()
    const lines = readTerminalLines(input, () => {}, {
      foreground: async () => false,
      signals: null,
    })
    expect(await lines.ready).toBe(false)
    expect(input.listenerCount('data')).toBe(0)
    lines.stop()
  })

  test('a background reader starts reading once it is in the foreground', async () => {
    const input = new PassThrough()
    let front = false
    const lines = readTerminalLines(input, () => {}, {
      foreground: async () => front,
      signals: null,
      pollMs: 5,
    })
    expect(await lines.ready).toBe(false)
    // `fg` on a running job sends no signal; the poll sees it.
    front = true
    await vi.waitFor(() => expect(input.listenerCount('data')).toBe(1))
    lines.stop()
    expect(input.listenerCount('data')).toBe(0)
  })

  test('a failed check reads nothing', async () => {
    const input = new PassThrough()
    const lines = readTerminalLines(input, () => {}, {
      foreground: () => Promise.reject(new Error('no ps')),
      signals: null,
    })
    expect(await lines.ready).toBe(false)
    expect(input.listenerCount('data')).toBe(0)
    lines.stop()
  })

  test('Ctrl-Z stops reading before the stop, and a resume checks again', async () => {
    const input = new PassThrough()
    const signals = fakeSignals()
    let front = true
    const lines = readTerminalLines(input, () => {}, {
      foreground: async () => front,
      signals,
    })
    expect(await lines.ready).toBe(true)
    signals.emit('SIGTSTP')
    expect(input.listenerCount('data')).toBe(0)
    expect(signals.suspends).toBe(1)
    // `bg`: resumed in the background.
    front = false
    signals.emit('SIGCONT')
    await new Promise((r) => setImmediate(r))
    expect(input.listenerCount('data')).toBe(0)
    // `fg`: back in the foreground.
    front = true
    signals.emit('SIGCONT')
    await vi.waitFor(() => expect(input.listenerCount('data')).toBe(1))
    lines.stop()
    expect(input.listenerCount('data')).toBe(0)
    // After stop, the signals are not followed.
    signals.emit('SIGCONT')
    await new Promise((r) => setImmediate(r))
    expect(input.listenerCount('data')).toBe(0)
    signals.emit('SIGTSTP')
    expect(signals.suspends).toBe(1)
  })
})
