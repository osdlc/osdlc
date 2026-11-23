/**
 * CheckoutLocator and locateCheckout, over real git checkouts in a temporary
 * home and a fake SSH alias resolver.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { CheckoutLocator, locateCheckout, parseRepoTarget } from '../src/repositories.ts'
import { makeSandbox, type Sandbox } from './helpers.ts'

let sb: Sandbox
beforeEach(() => {
  sb = makeSandbox()
  mkdirSync(join(sb.home, 'dev'))
  mkdirSync(join(sb.home, 'work'))
  sb.writeFile('roots:\n  - ~/dev\n  - ~/work\n')
})
afterEach(() => sb.cleanup())

describe('locateCheckout', () => {
  test('finds a checkout by its origin, in any letter case', () => {
    const widgets = sb.checkout('dev/acme/widgets', 'https://github.com/acme/widgets.git')
    sb.checkout('dev/acme/gadgets', 'https://github.com/acme/gadgets.git')
    const expected = [
      { path: widgets.dir, origin: { host: 'github.com', owner: 'acme', repo: 'widgets' } },
    ]
    expect(locateCheckout('acme/widgets', sb.opts)).toEqual(expected)
    expect(locateCheckout('ACME/Widgets', sb.opts)).toEqual(expected)
    expect(locateCheckout({ owner: 'acme', repo: 'widgets' }, sb.opts)).toEqual(expected)
  })

  test('returns every match, across roots, sorted by path', () => {
    const one = sb.checkout('dev/acme/widgets', 'git@github.com:acme/widgets.git')
    const two = sb.checkout('work/widgets-copy', 'https://github.com/acme/widgets')
    expect(locateCheckout('acme/widgets', sb.opts).map((c) => c.path)).toEqual([one.dir, two.dir])
  })

  test('a host in the target must match the host of the origin', () => {
    const gh = sb.checkout('dev/gh/widgets', 'git@github.com:acme/widgets.git')
    const forge = sb.checkout('dev/forge/widgets', 'https://git.example.com/acme/widgets.git')
    const paths = (target: string) => locateCheckout(target, sb.opts).map((c) => c.path)
    expect(paths('github.com/acme/widgets')).toEqual([gh.dir])
    expect(paths('git.example.com/acme/widgets')).toEqual([forge.dir])
    expect(paths('acme/widgets')).toEqual([forge.dir, gh.dir])
  })

  test('an origin through an SSH alias matches the host the alias stands for', () => {
    const work = sb.checkout('dev/acme/widgets', 'git@github-work:acme/widgets.git')
    const resolveAlias = vi.fn(sb.opts.resolveAlias!)
    const found = locateCheckout('github.com/acme/widgets', { ...sb.opts, resolveAlias })
    expect(found).toEqual([
      { path: work.dir, origin: { host: 'github.com', owner: 'acme', repo: 'widgets' } },
    ])
    expect(resolveAlias).toHaveBeenCalledWith('github-work')
  })

  test('a linked worktree under a root counts once, as its main checkout', () => {
    const main = sb.checkout('dev/acme/widgets', 'git@github.com:acme/widgets.git')
    main.commit('first')
    main.git.worktreeAdd(join(sb.home, 'work', 'widgets-feature'), { branch: 'feature' })
    main.git.worktreeAdd(join(sb.home, 'work', 'widgets-fix'), { branch: 'fix' })
    expect(locateCheckout('acme/widgets', sb.opts)).toEqual([
      { path: main.dir, origin: { host: 'github.com', owner: 'acme', repo: 'widgets' } },
    ])
  })

  test('a worktree under a root whose main checkout is elsewhere gives the main checkout', () => {
    const main = sb.checkout('../elsewhere/widgets', 'git@github.com:acme/widgets.git')
    main.commit('first')
    main.git.worktreeAdd(join(sb.home, 'dev', 'widgets-feature'), { branch: 'feature' })
    expect(locateCheckout('acme/widgets', sb.opts).map((c) => c.path)).toEqual([main.dir])
  })

  test('a checkout without origin, or with an origin that names no repository, is skipped', () => {
    sb.checkout('dev/no-origin')
    sb.checkout('dev/local-origin', join(sb.root, 'some', 'path'))
    const locator = new CheckoutLocator(sb.opts)
    expect(locator.checkouts()).toEqual([])
  })

  test('a directory with a .git that git cannot read is skipped', () => {
    mkdirSync(join(sb.home, 'dev', 'broken'))
    writeFileSync(join(sb.home, 'dev', 'broken', '.git'), 'gitdir: /nowhere\n')
    const good = sb.checkout('dev/widgets', 'git@github.com:acme/widgets.git')
    expect(locateCheckout('acme/widgets', sb.opts).map((c) => c.path)).toEqual([good.dir])
  })

  test('a broken .git under a root does not answer with the repository around the root', () => {
    // ~/outer is a repository, and the only root sits inside it.
    sb.checkout('outer', 'git@github.com:acme/outer.git')
    mkdirSync(join(sb.home, 'outer', 'sub', 'broken', '.git'), { recursive: true })
    const real = sb.checkout('outer/sub/widgets', 'git@github.com:acme/widgets.git')
    real.commit('first')
    real.git.worktreeAdd(join(sb.home, 'outer', 'sub', 'widgets-feature'), { branch: 'feature' })
    sb.writeFile('roots:\n  - ~/outer/sub\n')
    expect(new CheckoutLocator(sb.opts).checkouts()).toEqual([
      { path: real.dir, origin: { host: 'github.com', owner: 'acme', repo: 'widgets' } },
    ])
  })

  test('a dotfiles repository at the home directory is never the answer', () => {
    sb.checkout('', 'git@github.com:me/dotfiles.git')
    mkdirSync(join(sb.home, 'dev', 'half-made', '.git'), { recursive: true })
    expect(locateCheckout('me/dotfiles', sb.opts)).toEqual([])
  })

  test('no match is []', () => {
    sb.checkout('dev/acme/widgets', 'git@github.com:acme/widgets.git')
    expect(locateCheckout('acme/other', sb.opts)).toEqual([])
  })

  test('maxDepth limits how deep a root is walked', () => {
    sb.checkout('dev/a/b/c/widgets', 'git@github.com:acme/widgets.git')
    expect(locateCheckout('acme/widgets', sb.opts)).toEqual([])
    expect(locateCheckout('acme/widgets', { ...sb.opts, maxDepth: 4 })).toHaveLength(1)
  })

  test('depthLimited counts the directories maxDepth left unopened, over every root', () => {
    sb.checkout('dev/a/b/c/widgets', 'git@github.com:acme/widgets.git')
    sb.checkout('work/x/y/z/gadgets', 'git@github.com:acme/gadgets.git')
    const shallow = new CheckoutLocator(sb.opts)
    expect(shallow.locate('acme/widgets')).toEqual([])
    expect(shallow.depthLimited).toBe(2)
    // Read before any locate, it scans.
    expect(new CheckoutLocator({ ...sb.opts, maxDepth: 4 }).depthLimited).toBe(0)
  })

  test('with no file, the default roots of the caller are scanned', () => {
    sb.writeFile('')
    const caller = sb.checkout('dev/acme/app', 'git@github.com:acme/app.git')
    const widgets = sb.checkout('dev/acme/widgets', 'git@github.com:acme/widgets.git')
    sb.checkout('work/widgets', 'git@github.com:acme/widgets.git')
    const found = locateCheckout('acme/widgets', { ...sb.opts, caller: caller.dir })
    expect(found.map((c) => c.path)).toEqual([widgets.dir])
  })
})

describe('CheckoutLocator', () => {
  test('gives the roots searched and the file before any scan', () => {
    const locator = new CheckoutLocator(sb.opts)
    expect(locator.roots).toEqual([join(sb.home, 'dev'), join(sb.home, 'work')])
    expect(locator.source).toBe('file')
    expect(locator.file).toBe(sb.file)
  })

  test('builds one index: many targets, one scan', () => {
    sb.checkout('dev/acme/widgets', 'git@github.com:acme/widgets.git')
    sb.checkout('dev/acme/gadgets', 'git@github.com:acme/gadgets.git')
    // readRemote asks the resolver about this origin's host once per scan.
    sb.checkout('dev/forge/tool', 'git@forge:acme/tool.git')
    const calls: string[] = []
    const resolveAlias = (alias: string) => {
      calls.push(alias)
      return null
    }
    const locator = new CheckoutLocator({ ...sb.opts, resolveAlias })
    expect(locator.locate('acme/widgets')).toHaveLength(1)
    expect(locator.locate('acme/gadgets')).toHaveLength(1)
    expect(locator.locate('acme/tool')).toHaveLength(1)
    expect(calls).toEqual(['forge'])

    // A checkout made after the scan is not in this locator's index; a new locator sees it.
    sb.checkout('work/late', 'git@github.com:acme/late.git')
    expect(locator.locate('acme/late')).toEqual([])
    expect(new CheckoutLocator(sb.opts).locate('acme/late')).toHaveLength(1)
  })

  test('warnings go to onWarn', () => {
    sb.writeFile('roots:\n  - dev\n')
    const onWarn = vi.fn()
    expect(new CheckoutLocator({ ...sb.opts, onWarn }).roots).toEqual([])
    expect(onWarn).toHaveBeenCalledWith(`${sb.file}: root 'dev' is not an absolute path; ignored`)
  })
})

describe('parseRepoTarget', () => {
  test('owner/name carries no host; host/owner/name does', () => {
    expect(parseRepoTarget('acme/widgets')).toEqual({ owner: 'acme', repo: 'widgets' })
    expect(parseRepoTarget(' github.com/acme/widgets ')).toEqual({
      host: 'github.com',
      owner: 'acme',
      repo: 'widgets',
    })
  })

  test('any other shape throws', () => {
    for (const bad of ['widgets', 'a/b/c/d', 'acme/', '/widgets', '']) {
      expect(() => parseRepoTarget(bad)).toThrow(/is not owner\/name or host\/owner\/name/)
    }
  })
})
