import { mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { PathError, PathGuard, type Resolver } from '../src/index.ts'
import { nodeGuard, nodeResolver } from '../src/node.ts'
import {
  CASE_KEYS,
  HOST,
  INPUT_KEYS,
  WINDOWS,
  inScratch,
  landsIn,
  readSuite,
  run,
} from './conformance.ts'
import type { Case, Tree } from './conformance.ts'

/**
 * Runs `packages/conformance/path-guard/suite.json`, the cases this package
 * and the Rust `path-guard` crate must agree on. `conformance.ts` holds the
 * runner, which also writes the suite's expected values. The tests here add
 * what the suite's values cannot say on their own: the Windows check of the
 * on-disk cases that pin the POSIX `..` rule, and the on-disk sections again
 * through an in-memory resolver.
 */

const suite = readSuite()
const sections = suite.sections

/** Whether a case runs on this host. */
function runsHere(c: Case): boolean {
  if (c.skip?.['ts'] !== undefined) return false
  return c.platforms === undefined || c.platforms.includes(HOST)
}

describe('conformance suite', () => {
  test('is the path-guard suite, with this package as its reference', () => {
    expect([suite.family, suite.reference]).toEqual(['path-guard', 'ts'])
  })

  test('names no section this implementation does not run', () => {
    expect(Object.keys(sections).filter((s) => !(s in INPUT_KEYS))).toEqual([])
  })

  test('sets no key on a case that this implementation does not read', () => {
    for (const section of Object.values(sections)) {
      for (const c of section.cases) {
        expect(
          Object.keys(c).filter((k) => !CASE_KEYS.includes(k)),
          c.name,
        ).toEqual([])
      }
    }
  })

  test('runs some case of every section here', () => {
    for (const [name, section] of Object.entries(sections)) {
      const here = section.cases.filter(runsHere).length
      // On Windows every contains_on_disk case holds a `..`; the test below checks those.
      if (!(WINDOWS && name === 'contains_on_disk')) expect(here, name).toBeGreaterThan(0)
    }
  })

  for (const [name, section] of Object.entries(sections)) {
    describe(name, () => {
      for (const c of section.cases) {
        test.skipIf(!runsHere(c))(c.name, () => {
          expect(run(name, c.input)).toEqual(
            c.error === undefined ? { expect: c.expect } : { error: { kind: c.error.kind } },
          )
        })
      }
    })
  }
})

// A case with a `..` pins the POSIX rule, where `link/..` is the parent of the
// link's target, so it runs on `unix` only. Node on Windows folds `..` as text
// first, so there the guard must agree with where the filesystem puts the path.
describe.runIf(WINDOWS)('on-disk cases for unix only, on Windows', () => {
  const unixOnly = (section: string) =>
    sections[section]!.cases.filter((c) => c.platforms?.includes('windows') === false)

  describe('resolve_on_disk', () => {
    for (const c of unixOnly('resolve_on_disk')) {
      test(c.name, () => {
        const input = c.input as unknown as Tree & { root: string; path: string }
        inScratch(input, (scratch) => {
          // Asks the guard, then writes a file there and sees where it lands.
          const root = join(scratch, input.root)
          const inside = nodeGuard.tryResolve(root, input.path) !== null
          const path = join(root, input.path)
          writeFileSync(path, '')
          expect(inside).toBe(landsIn(root, path))
        })
      })
    }
  })

  describe('contains_on_disk', () => {
    for (const c of unixOnly('contains_on_disk')) {
      test(c.name, () => {
        const input = c.input as unknown as Tree & { outer: string; inner: string }
        inScratch(input, (scratch) => {
          // Concatenated, not `join`ed, which would fold the `..`.
          const [outer, inner] = [`${scratch}/${input.outer}`, `${scratch}/${input.inner}`]
          const got = nodeGuard.contains(outer, inner)
          mkdirSync(inner, { recursive: true })
          expect(got).toBe(landsIn(outer, inner))
        })
      })
    }
  })
})

/** `{ expect: shape(value) }` or `{ error }`, as the suite spells an outcome. */
function outcome<T>(run: () => T, shape: (value: T) => Record<string, unknown>): object {
  try {
    return { expect: shape(run()) }
  } catch (e) {
    if (e instanceof PathError) return { error: { kind: e.kind } }
    throw e
  }
}

/** A case's own outcome, as {@link outcome} spells it. */
const want = (c: Case) => (c.error === undefined ? { expect: c.expect } : { error: c.error })

/**
 * `tree` as an in-memory {@link Resolver} rooted at `/s`, with the POSIX rules:
 * `link/..` is the parent of the link's target. Nothing touches the disk.
 */
function memory(tree: Tree): { resolver: Resolver; scratch: string } {
  const scratch = '/s'
  type Entry = { type: 'dir' } | { type: 'file' } | { type: 'link'; target: string }
  const entries = new Map<string, Entry>([['/', { type: 'dir' }]])
  const names = (path: string) => path.split('/').filter((s) => s !== '' && s !== '.')
  const at = (dir: string, name: string) => (dir === '/' ? `/${name}` : `${dir}/${name}`)
  const parent = (dir: string) => dir.slice(0, dir.lastIndexOf('/')) || '/'
  const add = (rel: string, entry: Entry) => {
    let dir = '/'
    const segs = names(`${scratch}/${rel}`)
    for (const seg of segs.slice(0, -1)) {
      dir = at(dir, seg)
      if (!entries.has(dir)) entries.set(dir, { type: 'dir' })
    }
    entries.set(at(dir, segs.at(-1)!), entry)
  }
  for (const dir of tree.dirs ?? []) add(dir, { type: 'dir' })
  for (const file of tree.files ?? []) add(file, { type: 'file' })
  for (const [link, target] of Object.entries(tree.links ?? {})) {
    add(link, { type: 'link', target: target.startsWith('/') ? scratch + target : target })
  }
  const fail = (code: string): never => {
    throw Object.assign(new Error(code), { code })
  }
  const realpath = (path: string): string => {
    if (!path.startsWith('/')) fail('ENOENT')
    let current = '/'
    let hops = 0
    const queue = names(path)
    for (let seg = queue.shift(); seg !== undefined; seg = queue.shift()) {
      if (seg === '..') {
        current = parent(current)
        continue
      }
      const next = at(current, seg)
      const entry = entries.get(next) ?? fail('ENOENT')
      if (entry.type === 'link') {
        if (++hops > 40) fail('ELOOP')
        if (entry.target.startsWith('/')) current = '/'
        queue.unshift(...names(entry.target))
      } else if (entry.type === 'file' && queue.length > 0) fail('ENOTDIR')
      else current = next
    }
    return current
  }
  const readlink = (path: string): string => {
    const name = path.slice(path.lastIndexOf('/') + 1)
    if (name === '' || name === '.' || name === '..') fail('EINVAL')
    const entry = entries.get(at(realpath(path.slice(0, path.lastIndexOf('/')) || '/'), name))
    return entry?.type === 'link' ? entry.target : fail('EINVAL')
  }
  return { resolver: { realpath, readlink }, scratch }
}

// The on-disk sections again, through an in-memory `Resolver`: the guard needs
// no disk. The tree follows the POSIX rules, so this runs where they hold.
describe.skipIf(WINDOWS)('the on-disk sections over an in-memory filesystem', () => {
  const strip = (scratch: string, path: string) => path.slice(scratch.length + 1)

  describe('resolve_on_disk', () => {
    for (const c of sections['resolve_on_disk']!.cases) {
      test(c.name, () => {
        const input = c.input as unknown as Tree & { root: string; path: string }
        const { resolver, scratch } = memory(input)
        const got = outcome(
          () => new PathGuard(resolver).resolve(`${scratch}/${input.root}`, input.path),
          (p) => ({ path: strip(scratch, p) }),
        )
        expect(got).toEqual(want(c))
      })
    }
  })

  describe('contains_on_disk', () => {
    for (const c of sections['contains_on_disk']!.cases) {
      test(c.name, () => {
        const input = c.input as unknown as Tree & { outer: string; inner: string }
        const { resolver, scratch } = memory(input)
        const guard = new PathGuard(resolver)
        const got = outcome(
          () => guard.contains(`${scratch}/${input.outer}`, `${scratch}/${input.inner}`),
          (contains) => ({ contains }),
        )
        expect(got).toEqual(want(c))
      })
    }
  })

  describe('real_path', () => {
    for (const c of sections['real_path']!.cases) {
      test(c.name, () => {
        const input = c.input as unknown as Tree & { path: string }
        const { resolver, scratch } = memory(input)
        const rooted = (path: string) => (path.startsWith('/') ? scratch + path : path)
        const got = outcome(
          () => new PathGuard(resolver).realPath(rooted(input.path)),
          (p) => ({ path: p.startsWith(`${scratch}/`) ? p.slice(scratch.length) : p }),
        )
        expect(got).toEqual(want(c))
      })
    }
  })

  test('the in-memory resolver agrees with nodeResolver on a real tree', () => {
    const tree: Tree = { dirs: ['root/a'], files: ['root/a/f.md'], links: { 'root/l': 'a' } }
    const { resolver, scratch } = memory(tree)
    inScratch(tree, (disk) => {
      const real = realpathSync.native(disk)
      for (const rel of ['root', 'root/l', 'root/l/f.md', 'root/l/..', 'root/a/../l/f.md']) {
        expect(resolver.realpath(`${scratch}/${rel}`).slice(scratch.length)).toBe(
          nodeResolver.realpath(`${disk}/${rel}`).slice(real.length),
        )
      }
      expect(resolver.readlink(`${scratch}/root/l`)).toBe(nodeResolver.readlink(`${disk}/root/l`))
    })
  })
})
