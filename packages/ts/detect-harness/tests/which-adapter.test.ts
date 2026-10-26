/**
 * `which`'s adapter over command-seam's `which`, on any host: what it passes
 * the seam for a given `env` and platform. The seam is stubbed, so the
 * Windows rules here need no Windows host. The lookup rules themselves are
 * command-seam's, tested there.
 */

import { afterEach, describe, expect, test, vi } from 'vitest'

import type { WhichOptions } from '@osdlc/command-seam'

const calls = vi.hoisted(() => [] as { binary: string; opts: WhichOptions | undefined }[])

vi.mock('@osdlc/command-seam', async (importOriginal) => {
  const real = await importOriginal<typeof import('@osdlc/command-seam')>()
  return {
    ...real,
    which: (binary: string, opts?: WhichOptions) => {
      calls.push({ binary, opts })
      return '/found'
    },
  }
})

const { which } = await import('../src/which.ts')

afterEach(() => {
  calls.length = 0
})

describe('which adapter', () => {
  test('win32 reads Path and PATHEXT in any case and passes them through', () => {
    expect(which('tool', { Path: 'C:\\bin', pathext: '.EXE' }, 'win32')).toBe('/found')
    expect(calls).toEqual([
      {
        binary: 'tool',
        opts: {
          env: { PATH: 'C:\\bin', PATHEXT: '.EXE' },
          platform: 'win32',
          absolutePathOnly: true,
        },
      },
    ])
  })

  test('an unset PATHEXT is passed as unset, so the seam never reads process.env', () => {
    which('tool', { PATH: 'C:\\bin' }, 'win32')
    const env = calls[0]?.opts?.env
    expect(env?.['PATHEXT']).toBeUndefined()
    expect(Object.keys(env ?? {})).toContain('PATHEXT')
  })

  test('a missing PATH finds nothing without asking the seam', () => {
    expect(which('tool', {}, 'win32')).toBeNull()
    expect(which('tool', { Path: 'C:\\bin' }, 'linux')).toBeNull()
    expect(calls).toEqual([])
  })

  test('POSIX reads PATH by its exact name only', () => {
    which('tool', { PATH: '/bin', path: '/elsewhere' }, 'linux')
    expect(calls[0]?.opts?.env?.['PATH']).toBe('/bin')
  })

  test('an absolute path gets the passed PATHEXT, and a relative one is refused', () => {
    const abs = process.platform === 'win32' ? 'C:\\bin\\tool' : '/bin/tool'
    expect(which(abs, { PATHEXT: '.CMD' }, 'win32', '/project')).toBe('/found')
    expect(calls).toEqual([
      { binary: abs, opts: { cwd: '/project', platform: 'win32', env: { PATHEXT: '.CMD' } } },
    ])
    expect(which('bin/tool', { PATH: '/bin' }, 'win32')).toBeNull()
    expect(calls).toHaveLength(1)
  })
})
