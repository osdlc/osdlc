import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import { drift, write } from '../scripts/emit-fixtures.ts'

describe('emit-fixtures', () => {
  let dir: string | undefined
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = undefined
  })

  test('write removes stale fixtures, so --check passes after a regenerate', () => {
    dir = mkdtempSync(join(tmpdir(), 'agent-router-fixtures-'))
    mkdirSync(join(dir, 'walk'))
    writeFileSync(join(dir, 'walk', 'choose.json'), '[]\n')
    const emitted = new Map([[join('walk', 'pick.json'), '[]\n']])

    write(emitted, dir)

    expect(existsSync(join(dir, 'walk', 'choose.json'))).toBe(false)
    expect(drift(emitted, dir)).toEqual([])
  })
})
