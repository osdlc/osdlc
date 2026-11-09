import { describe, expect, test } from 'vitest'

import type { Host } from '../src/contract.ts'
import { ensureWorkspace } from '../src/open-workspace.ts'

const base: Host = { name: 'jetbrains', platforms: 'all', available: () => true }

describe('ensureWorkspace', () => {
  test('enabled and the host has the part: opens and passes the notice through', () => {
    const seen: string[] = []
    const host: Host = {
      ...base,
      openWorkspace: (q) => {
        q.notice?.('opening')
        seen.push(q.cwd)
        return { root: q.cwd, opened: true }
      },
    }
    const lines: string[] = []
    ensureWorkspace(host, '/repo', true, (l) => lines.push(l))
    expect(seen).toEqual(['/repo'])
    expect(lines).toEqual(['opening'])
  })

  test('disabled: the part is not called', () => {
    let called = false
    const host: Host = {
      ...base,
      openWorkspace: () => {
        called = true
        return { root: '/', opened: false }
      },
    }
    ensureWorkspace(host, '/repo', false, () => {})
    expect(called).toBe(false)
  })

  test('a host without the part is left alone', () => {
    expect(() => ensureWorkspace(base, '/repo', true, () => {})).not.toThrow()
  })

  test('a failing open propagates', () => {
    const host: Host = {
      ...base,
      openWorkspace: () => {
        throw new Error('no IDE')
      },
    }
    expect(() => ensureWorkspace(host, '/repo', true, () => {})).toThrow('no IDE')
  })
})
