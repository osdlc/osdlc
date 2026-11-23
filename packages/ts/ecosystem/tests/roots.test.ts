/**
 * resolveRoots and defaultRoots: each case of D-ZVIA's table, and the home
 * directory stop.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { spawnRunner, type CommandRunner } from '@osdlc/command-seam'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { REPOSITORIES_ENV, defaultRoots, resolveRoots } from '../src/repositories.ts'
import { makeSandbox, type Sandbox } from './helpers.ts'

let sb: Sandbox
beforeEach(() => {
  sb = makeSandbox()
})
afterEach(() => sb.cleanup())

const dir = (path: string): string => {
  mkdirSync(path, { recursive: true })
  return path
}

describe('resolveRoots, from repositories.yaml', () => {
  test('an absolute root is a root, and ~ expands against the home directory', () => {
    const abs = dir(join(sb.root, 'srv', 'repos'))
    const dev = dir(join(sb.home, 'dev'))
    sb.writeFile(`roots:\n  - ${abs}\n  - ~/dev\n  - '~'\n`)
    expect(resolveRoots(sb.opts)).toEqual({
      roots: [abs, dev, sb.home],
      source: 'file',
      file: sb.file,
    })
    expect(sb.warnings).toEqual([])
  })

  test('a relative root is dropped, with a warning that names the file', () => {
    const dev = dir(join(sb.home, 'dev'))
    sb.writeFile('roots:\n  - dev/repos\n  - ~/dev\n  - ~someone/dev\n')
    expect(resolveRoots(sb.opts).roots).toEqual([dev])
    expect(sb.warnings).toEqual([
      `${sb.file}: root 'dev/repos' is not an absolute path; ignored`,
      `${sb.file}: root '~someone/dev' is not an absolute path; ignored`,
    ])
  })

  test('a root that does not exist is skipped silently', () => {
    const dev = dir(join(sb.home, 'dev'))
    sb.writeFile(`roots:\n  - ${join(sb.root, 'other-machine')}\n  - ~/dev\n`)
    expect(resolveRoots(sb.opts).roots).toEqual([dev])
    expect(sb.warnings).toEqual([])
  })

  test('a root listed twice is searched once', () => {
    const dev = dir(join(sb.home, 'dev'))
    sb.writeFile(`roots:\n  - ~/dev\n  - ${dev}/\n`)
    expect(resolveRoots(sb.opts).roots).toEqual([dev])
  })

  test('roots: [] scans nothing, even for a caller with a checkout', () => {
    const checkout = sb.checkout('dev/widgets', 'git@github.com:acme/widgets.git')
    sb.writeFile('roots: []\n')
    expect(resolveRoots({ ...sb.opts, caller: checkout.dir })).toEqual({
      roots: [],
      source: 'file',
      file: sb.file,
    })
  })

  test('no file gives the default roots', () => {
    const checkout = sb.checkout('dev/widgets', 'git@github.com:acme/widgets.git')
    expect(resolveRoots({ ...sb.opts, caller: checkout.dir })).toEqual({
      roots: [join(sb.home, 'dev')],
      source: 'default',
      file: sb.file,
    })
  })

  test('a file without roots gives the default roots', () => {
    const checkout = sb.checkout('dev/widgets', 'git@github.com:acme/widgets.git')
    sb.writeFile('# nothing here yet\n')
    const resolved = resolveRoots({ ...sb.opts, caller: checkout.dir })
    expect(resolved.source).toBe('default')
    expect(resolved.roots).toEqual([join(sb.home, 'dev')])
  })

  test('an invalid roots is reported, naming the file, and the defaults apply', () => {
    sb.writeFile('roots: ~/dev\n')
    const resolved = resolveRoots(sb.opts)
    expect(resolved).toEqual({ roots: [], source: 'default', file: sb.file })
    expect(sb.warnings).toHaveLength(1)
    expect(sb.warnings[0]).toMatch(new RegExp(`^${escape(sb.file)}: roots: .*using the default`))
  })

  test('OSDLC_REPOSITORIES points at another file', () => {
    const other = join(sb.root, 'other.yaml')
    vi.stubEnv(REPOSITORIES_ENV, other)
    expect(resolveRoots(sb.opts)).toEqual({ roots: [], source: 'default', file: other })
  })

  test('a relative OSDLC_REPOSITORIES throws', () => {
    vi.stubEnv(REPOSITORIES_ENV, './repositories.yaml')
    expect(() => resolveRoots(sb.opts)).toThrow(/must be an absolute path/)
  })
})

describe('defaultRoots', () => {
  const origin = 'git@github.com:acme/widgets.git'
  const roots = (caller: string | undefined) => defaultRoots({ ...sb.opts, caller })

  test('the directory that holds the caller main checkout', () => {
    const checkout = sb.checkout('dev/repos/widgets', origin)
    expect(roots(checkout.dir)).toEqual([join(sb.home, 'dev', 'repos')])
  })

  test('the directory above, when the holder is named after the origin owner', () => {
    const checkout = sb.checkout('dev/acme/widgets', origin)
    expect(roots(checkout.dir)).toEqual([join(sb.home, 'dev')])
  })

  test('the owner is compared in any letter case', () => {
    const checkout = sb.checkout('dev/ACME/widgets', origin)
    expect(roots(checkout.dir)).toEqual([join(sb.home, 'dev')])
  })

  test('the owner comes through an SSH alias', () => {
    const checkout = sb.checkout('dev/acme/widgets', 'git@github-work:acme/widgets.git')
    const resolveAlias = vi.fn((alias: string) => (alias === 'github-work' ? 'github.com' : null))
    expect(defaultRoots({ ...sb.opts, caller: checkout.dir, resolveAlias })).toEqual([
      join(sb.home, 'dev'),
    ])
    expect(resolveAlias).toHaveBeenCalledWith('github-work')
  })

  test('a holder not named after the owner stays', () => {
    const checkout = sb.checkout('dev/other/widgets', origin)
    expect(roots(checkout.dir)).toEqual([join(sb.home, 'dev', 'other')])
  })

  test('no origin: no step up', () => {
    const checkout = sb.checkout('dev/acme/widgets')
    expect(roots(checkout.dir)).toEqual([join(sb.home, 'dev', 'acme')])
  })

  test('a caller inside a linked worktree resolves to its main checkout', () => {
    const checkout = sb.checkout('dev/acme/widgets', origin)
    checkout.commit('first')
    const worktree = join(sb.root, 'worktrees', 'widgets-feature')
    checkout.git.worktreeAdd(worktree, { branch: 'feature' })
    expect(roots(worktree)).toEqual([join(sb.home, 'dev')])
  })

  test('a caller deeper inside the checkout', () => {
    const checkout = sb.checkout('dev/acme/widgets', origin)
    const sub = dir(join(checkout.dir, 'src', 'lib'))
    expect(roots(sub)).toEqual([join(sb.home, 'dev')])
  })

  test('a checkout directly in the home directory keeps the home directory', () => {
    const checkout = sb.checkout('widgets', origin)
    expect(roots(checkout.dir)).toEqual([sb.home])
  })

  test('an owner directory directly in the home directory does not step up to it', () => {
    const checkout = sb.checkout('acme/widgets', origin)
    expect(roots(checkout.dir)).toEqual([join(sb.home, 'acme')])
  })

  test('a checkout that is the home directory gives no default root', () => {
    sb.checkout('', origin)
    expect(roots(sb.home)).toEqual([])
    expect(roots(dir(join(sb.home, 'notes')))).toEqual([])
  })

  test('a checkout that holds the home directory gives no default root', () => {
    const checkout = sb.checkout('../outer', origin)
    const home = dir(join(checkout.dir, 'me'))
    expect(defaultRoots({ ...sb.opts, home, caller: checkout.dir })).toEqual([])
  })

  test('a checkout beside the home directory gives none: its holder is above home', () => {
    // home is <root>/home, so <root>/widgets is held by <root>, the home's parent.
    const checkout = sb.checkout('../widgets', origin)
    expect(roots(checkout.dir)).toEqual([])
  })

  test('a checkout outside the home directory steps up as usual', () => {
    const checkout = sb.checkout('../srv/acme/widgets', origin)
    expect(roots(checkout.dir)).toEqual([join(sb.root, 'srv')])
  })

  test('an inherited GIT_DIR naming another repository does not change the answer', () => {
    // A hook in a linked worktree of another repository exports an absolute GIT_DIR.
    const other = sb.checkout('../elsewhere/acme/other', origin)
    other.commit('first')
    other.git.worktreeAdd(join(sb.root, 'wt', 'other-feature'), { branch: 'feature' })
    const checkout = sb.checkout('dev/acme/widgets', origin)
    vi.stubEnv('GIT_DIR', join(other.dir, '.git', 'worktrees', 'other-feature'))
    vi.stubEnv('GIT_WORK_TREE', join(sb.root, 'wt', 'other-feature'))
    vi.stubEnv('GIT_COMMON_DIR', join(other.dir, '.git'))
    expect(roots(checkout.dir)).toEqual([join(sb.home, 'dev')])
  })

  test("GIT_DIR='.', as a receive hook sets it, does not change the answer", () => {
    const checkout = sb.checkout('dev/acme/widgets', origin)
    vi.stubEnv('GIT_DIR', '.')
    expect(roots(checkout.dir)).toEqual([join(sb.home, 'dev')])
  })

  test('no caller, or a caller outside any checkout, gives none', () => {
    expect(roots(undefined)).toEqual([])
    expect(roots(dir(join(sb.home, 'scratch')))).toEqual([])
    expect(roots(join(sb.home, 'missing'))).toEqual([])
  })

  test('git runs through the runner given', () => {
    const checkout = sb.checkout('dev/acme/widgets', origin)
    const calls: string[][] = []
    const runner: CommandRunner = {
      run(args, opts) {
        calls.push([...args])
        return realRunner.run(args, opts)
      },
    }
    expect(defaultRoots({ ...sb.opts, caller: checkout.dir, runner })).toEqual([
      join(sb.home, 'dev'),
    ])
    expect(calls.length).toBeGreaterThan(0)
  })
})

const realRunner = spawnRunner('git', { absolutePathOnly: true })

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
