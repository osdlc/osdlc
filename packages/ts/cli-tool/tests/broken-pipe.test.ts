/** A closed stdout or stderr pipe ends a run quietly instead of crashing on EPIPE. */

import { EventEmitter } from 'node:events'

import { afterEach, describe, expect, test } from 'vitest'

import { captureContext, quietOnBrokenPipe, runMain } from '../src/index.ts'

const errno = (code: string) => Object.assign(new Error(`write ${code}`), { code })

describe('quietOnBrokenPipe', () => {
  test('EPIPE exits 0; another error is thrown', () => {
    const stream = new EventEmitter()
    const exits: number[] = []
    quietOnBrokenPipe(stream as never, (code) => exits.push(code))
    stream.emit('error', errno('EPIPE'))
    expect(exits).toEqual([0])
    expect(() => stream.emit('error', errno('EIO'))).toThrow('EIO')
    expect(exits).toEqual([0])
  })

  test('the writes after the first broken one exit once, not again', () => {
    const stream = new EventEmitter()
    const exits: number[] = []
    quietOnBrokenPipe(stream as never, (code) => exits.push(code))
    stream.emit('error', errno('EPIPE'))
    stream.emit('error', errno('ERR_STREAM_DESTROYED'))
    expect(exits).toEqual([0])
  })

  test('with exit null a broken pipe is dropped and the run goes on', () => {
    const stream = new EventEmitter()
    quietOnBrokenPipe(stream as never, null)
    expect(() => stream.emit('error', errno('EPIPE'))).not.toThrow()
    expect(() => stream.emit('error', errno('ERR_STREAM_DESTROYED'))).not.toThrow()
    expect(() => stream.emit('error', errno('EIO'))).toThrow('EIO')
  })
})

describe('runMain', () => {
  const before = process.exitCode
  const listeners = () => [
    process.stdout.listenerCount('error'),
    process.stderr.listenerCount('error'),
  ]
  let added: Array<(...args: unknown[]) => void> = []
  afterEach(() => {
    process.exitCode = before ?? 0
    for (const s of [process.stdout, process.stderr]) {
      for (const l of s.listeners('error'))
        if (added.includes(l as never)) s.off('error', l as never)
    }
    added = []
  })

  test('guards the process streams when it uses them', async () => {
    const [out, err] = listeners()
    const known = [...process.stdout.listeners('error'), ...process.stderr.listeners('error')]
    await runMain(() => 0, { name: 't', argv: [] })
    expect(listeners()).toEqual([out! + 1, err! + 1])
    added = [...process.stdout.listeners('error'), ...process.stderr.listeners('error')].filter(
      (l) => !known.includes(l),
    ) as never
  })

  test('leaves the process streams alone with an injected context', async () => {
    const [out, err] = listeners()
    await runMain(() => 0, { name: 't', argv: [], context: captureContext() })
    expect(listeners()).toEqual([out, err])
  })
})
