/**
 * `which`: the lookup rules a spawn uses, without spawning. POSIX, except the
 * pure `absolutePathCandidates` cases, which cover Windows.
 */

import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, test } from 'vitest'

import {
  absolutePathCandidates,
  classifyFailure,
  spawnRunner,
  spawnRunnerAsync,
  which,
} from '../src/index.ts'

const root = realpathSync(mkdtempSync(join(tmpdir(), 'seam-which-')))
afterAll(() => rmSync(root, { recursive: true, force: true }))

function file(rel: string, mode: number): string {
  const p = join(root, rel)
  mkdirSync(join(p, '..'), { recursive: true })
  writeFileSync(p, '#!/bin/sh\necho ran\n')
  chmodSync(p, mode)
  return p
}

const first = file('a/tool', 0o755)
const second = file('b/tool', 0o755)
file('a/plain', 0o644)
file('b/plain', 0o755)
mkdirSync(join(root, 'a/dir-tool'), { recursive: true })
const PATH = `${join(root, 'a')}:${join(root, 'b')}`

// POSIX only: the stand-ins have no `.exe` or `.cmd` extension and `PATH` uses `:`; which-windows.test.ts covers Windows.
describe.skipIf(process.platform === 'win32')('which', () => {
  test('the first executable match on PATH wins', () => {
    expect(which('tool', { env: { PATH } })).toBe(first)
    expect(which('tool', { env: { PATH: `${join(root, 'b')}:${join(root, 'a')}` } })).toBe(second)
  })

  test('a file without the execute bit, or a folder, is skipped', () => {
    expect(which('plain', { env: { PATH } })).toBe(join(root, 'b/plain'))
    expect(which('dir-tool', { env: { PATH } })).toBeUndefined()
  })

  test('a missing binary, an empty name and a missing PATH folder are undefined', () => {
    expect(which('definitely-not-a-real-binary-which', { env: { PATH } })).toBeUndefined()
    expect(which('', { env: { PATH } })).toBeUndefined()
    expect(which('tool', { env: { PATH: join(root, 'nope') } })).toBeUndefined()
  })

  test('a name with a slash is resolved against cwd, not searched', () => {
    expect(which('./a/tool', { cwd: root, env: { PATH: '' } })).toBe(first)
    expect(which(first, { env: { PATH: '' } })).toBe(first)
    expect(which('a/plain', { cwd: root })).toBeUndefined()
  })

  test('an empty PATH entry means cwd, as for Node', () => {
    const a = join(root, 'a')
    expect(which('tool', { cwd: a, env: { PATH: '' } })).toBe(first)
    expect(which('tool', { cwd: a, env: { PATH: `${join(root, 'nope')}::/x` } })).toBe(first)
  })

  test('a relative PATH entry is resolved against cwd', () => {
    expect(which('tool', { cwd: root, env: { PATH: 'b' } })).toBe(second)
  })

  test('without env it reads the parent PATH, like the runners', () => {
    expect(which('sh')).toMatch(/\/sh$/)
  })

  test('PATH set to undefined falls back to /usr/bin:/bin', () => {
    const found = which('sh', { env: { PATH: undefined } })
    expect(found === '/usr/bin/sh' || found === '/bin/sh').toBe(true)
  })

  test('agrees with spawnRunner on what it can start', () => {
    const r = spawnRunner('tool').run([], { cwd: root, env: { PATH } })
    expect(r.stdout).toBe('ran\n')
    const missing = spawnRunner('dir-tool').run([], { cwd: root, env: { PATH } })
    expect(missing.neverExited).toBe(true)
  })
})

// POSIX only: the stand-ins have no `.exe` or `.cmd` extension and `PATH` uses `:`; which-windows.test.ts covers Windows.
describe.skipIf(process.platform === 'win32')('which with absolutePathOnly', () => {
  const a = join(root, 'a')

  test('skips relative and empty PATH entries, and never searches cwd', () => {
    const opts = { cwd: a, absolutePathOnly: true }
    expect(which('tool', { ...opts, env: { PATH: 'b' } })).toBeUndefined()
    expect(which('tool', { ...opts, env: { PATH: '' } })).toBeUndefined()
    expect(which('tool', { ...opts, env: { PATH: `.:b::${join(root, 'b')}` } })).toBe(second)
  })

  test('a name with a slash is still a path', () => {
    expect(which('./tool', { cwd: a, env: { PATH: '' }, absolutePathOnly: true })).toBe(first)
  })
})

describe('absolutePathCandidates', () => {
  test('POSIX: absolute entries only, in order', () => {
    expect(
      absolutePathCandidates('git', { path: 'bin:/usr/bin::.:/opt/git/bin', platform: 'linux' }),
    ).toEqual(['/usr/bin/git', '/opt/git/bin/git'])
    expect(absolutePathCandidates('git', { path: undefined, platform: 'linux' })).toEqual([
      '/usr/bin/git',
      '/bin/git',
    ])
    expect(absolutePathCandidates('git', { path: undefined, platform: 'win32' })).toEqual([])
    expect(absolutePathCandidates('./git', { path: '/usr/bin', platform: 'linux' })).toEqual([])
  })

  test('Windows: PATHEXT on absolute entries, no cwd and no drive-relative entry', () => {
    const path = 'C:\\Git\\cmd;bin;;.;\\tools;D:/x;\\\\host\\share'
    expect(
      absolutePathCandidates('git', { path, pathext: '.EXE;.CMD', platform: 'win32' }),
    ).toEqual([
      'C:\\Git\\cmd\\git.EXE',
      'C:\\Git\\cmd\\git.CMD',
      'D:\\x\\git.EXE',
      'D:\\x\\git.CMD',
      '\\\\host\\share\\git.EXE',
      '\\\\host\\share\\git.CMD',
    ])
  })

  test('Windows: a name that already has a PATHEXT suffix is tried as given', () => {
    expect(
      absolutePathCandidates('git.exe', { path: 'C:\\Git', pathext: '.EXE', platform: 'win32' }),
    ).toEqual(['C:\\Git\\git.exe'])
    expect(absolutePathCandidates('bin\\git', { path: 'C:\\Git', platform: 'win32' })).toEqual([])
  })

  test('Windows: a quoted entry counts without its quotes; a quoted relative one does not', () => {
    const path = '"C:\\Program Files\\Git\\cmd";"bin";""'
    expect(absolutePathCandidates('git', { path, pathext: '.EXE', platform: 'win32' })).toEqual([
      'C:\\Program Files\\Git\\cmd\\git.EXE',
    ])
    // POSIX keeps quotes: there they are part of the name.
    expect(absolutePathCandidates('git', { path: '"/usr/bin"', platform: 'linux' })).toEqual([])
  })
})

describe('runners with absolutePathOnly', () => {
  const a = join(root, 'a')

  test('a binary on a relative PATH entry does not run, and reads as not installed', async () => {
    const sync = spawnRunner('tool', { absolutePathOnly: true }).run([], {
      cwd: a,
      env: { PATH: `.:${join(root, 'nope')}` },
    })
    expect(sync.neverExited).toBe(true)
    expect(sync.error).toMatch(/ENOENT/)
    const async_ = await spawnRunnerAsync('tool', { absolutePathOnly: true }).run([], {
      cwd: a,
      env: { PATH: '.' },
    })
    expect(async_.neverExited).toBe(true)
    expect(classifyFailure(async_, { binary: 'tool', argv: [] })?.kind).toBe('not-installed')
  })

  // POSIX only: the stand-ins have no `.exe` or `.cmd` extension and `PATH` uses `:`; which-windows.test.ts covers Windows.
  test.skipIf(process.platform === 'win32')('the absolute match runs', async () => {
    const env = { PATH: `.:${join(root, 'b')}` }
    expect(spawnRunner('tool', { absolutePathOnly: true }).run([], { cwd: a, env }).stdout).toBe(
      'ran\n',
    )
    const r = await spawnRunnerAsync('tool', { absolutePathOnly: true }).run([], { cwd: a, env })
    expect(r.stdout).toBe('ran\n')
  })
})
