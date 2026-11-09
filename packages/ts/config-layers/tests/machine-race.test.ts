import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { WriteConflictError } from '@osdlc/etag-write'

// An edit saved just before the swap's own check: the latest moment a
// concurrent writer can land and still be caught. Its own file, because the
// mock replaces `writeCas` for every test in it.
const race = vi.hoisted(() => ({ edit: null as null | (() => void) }))
vi.mock('@osdlc/etag-write', async (actual) => {
  const real = await actual<typeof import('@osdlc/etag-write')>()
  return {
    ...real,
    writeCas: (...args: Parameters<typeof real.writeCas>) => {
      race.edit?.()
      return real.writeCas(...args)
    },
  }
})

const { sandbox } = await import('./support.ts')
type Sandbox = ReturnType<typeof sandbox>

let sb: Sandbox
beforeEach(() => {
  sb = sandbox()
  race.edit = null
})
afterEach(() => sb.dispose())

test('an edit that lands after the etag check still leaves the .bak alone', () => {
  const p = join(sb.root, 'machine.yaml')
  writeFileSync(p, 'repos: [/one]\n')
  writeFileSync(`${p}.bak`, 'older backup\n')
  process.env[sb.machine.env] = p
  const seen = sb.machine.read()!
  race.edit = () => writeFileSync(p, 'repos: [/edited]\n')
  expect(() => sb.machine.write('repos: [/two]\n', { etag: seen.etag })).toThrow(WriteConflictError)
  expect(readFileSync(p, 'utf-8')).toBe('repos: [/edited]\n')
  expect(readFileSync(`${p}.bak`, 'utf-8')).toBe('older backup\n')
})

test('a write that goes through backs up the exact bytes it replaced', () => {
  const p = join(sb.root, 'machine.yaml')
  // Not valid UTF-8: a backup made from decoded text would differ.
  const old = Buffer.from('# caf\xe9\nrepos: [/one]\n', 'latin1')
  writeFileSync(p, old)
  process.env[sb.machine.env] = p
  const seen = sb.machine.read()!
  sb.machine.write('repos: [/two]\n', { etag: seen.etag })
  expect(readFileSync(p, 'utf-8')).toBe('repos: [/two]\n')
  expect(readFileSync(`${p}.bak`).equals(old)).toBe(true)
})
