import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'

import { describe, expect, test } from 'vitest'

import { PathError, PathGuard, lexical, type PathWarning, type Resolver } from '../src/index.ts'
import { nodeGuard, nodeResolver } from '../src/node.ts'

/** One outcome: `ok`, `error` (a `PathError` kind) or `expected` (a boolean). */
interface Outcome {
  ok?: string
  error?: string
  expected?: boolean
}

interface Case extends Outcome {
  name: string
  input: string
}

interface RootCase extends Case {
  root: string
}

interface WarningsCase extends Case {
  warnings: PathWarning[]
}

/** A guard case whose result depends on the host: `windows`, or `other` for every other platform. */
interface PerHostCase {
  name: string
  input: string
  windows: Outcome
  other: Outcome & { warnings: PathWarning[] }
}

interface AbsoluteCase extends Case {
  cwd: string
}

interface ContainsCase extends Outcome {
  name: string
  outer: string
  inner: string
}

/** The tree a case builds in a scratch directory. */
interface Tree {
  dirs?: string[]
  files?: string[]
  /** Link path to target text. A target starting with `/` is rooted at the scratch directory. */
  links?: Record<string, string>
}

interface OnDiskCase extends RootCase, Tree {}
interface ContainsOnDiskCase extends ContainsCase, Tree {}
interface RealPathCase extends Case, Tree {}

interface Fixture {
  validate_relative: Case[]
  windows_names: WarningsCase[]
  resolve: RootCase[]
  resolve_windows_names: PerHostCase[]
  contains: ContainsCase[]
  absolute: AbsoluteCase[]
  is_under: RootCase[]
  to_relative: RootCase[]
  resolve_on_disk: OnDiskCase[]
  contains_on_disk: ContainsOnDiskCase[]
  real_path: RealPathCase[]
}

/**
 * The one parity fixture lives in the Rust crate, which its `tests/parity.rs`
 * also reads. This suite reads it by its path in the repository, so a case added
 * on either side goes in the fixture, never in one package's own suite.
 */
const FIXTURE_PATH = join(
  import.meta.dirname,
  '../../../rust/path-guard/tests/fixtures/parity.json',
)
const f = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8')) as Fixture & Record<string, unknown>

const SECTIONS: (keyof Fixture)[] = [
  'validate_relative',
  'windows_names',
  'resolve',
  'resolve_windows_names',
  'contains',
  'absolute',
  'is_under',
  'to_relative',
  'resolve_on_disk',
  'contains_on_disk',
  'real_path',
]

const WINDOWS = process.platform === 'win32'

/** A path the guard returned, in the fixture's `/` spelling. Windows answers with `\`. */
const slashed = (path: string) => (WINDOWS ? path.replaceAll('\\', '/') : path)

/**
 * The guard sections use POSIX roots such as `/v`, which are not absolute on
 * Windows. There the runner puts them on drive `C:`, and takes the drive off
 * the answer again.
 */
const DRIVE = WINDOWS ? 'C:' : ''
const onHost = (path: string) => (path.startsWith('/') ? DRIVE + path : path)
const fromHost = (path: string) => {
  const p = slashed(path)
  return DRIVE !== '' && p.startsWith(`${DRIVE}/`) ? p.slice(DRIVE.length) : p
}

function enoent(): never {
  throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
}

/** A filesystem in which nothing exists, as the Rust side's `Nothing`. */
const nothing: Resolver = { realpath: enoent, readlink: enoent }

/** `{ ok }` or `{ error: kind }`, the fixture's spelling of an outcome. */
function outcome<T>(run: () => T): { ok: T } | { error: string } {
  try {
    return { ok: run() }
  } catch (e) {
    if (e instanceof PathError) return { error: e.kind }
    throw e
  }
}

/** The fixture's outcome as {@link outcome} spells it: `expected` is an `ok`. */
function expected(c: Outcome): { ok: string | boolean } | { error: string } {
  const set = [c.ok, c.error, c.expected].filter((v) => v !== undefined)
  if (set.length !== 1) throw new Error(`a case must set one of \`ok\`, \`error\` and \`expected\``)
  if (c.error !== undefined) return { error: c.error }
  return { ok: (c.ok ?? c.expected)! }
}

/** A guard that records each warning it is handed. */
function recording(resolver: Resolver): { guard: PathGuard; warnings: PathWarning[] } {
  const warnings: PathWarning[] = []
  return { guard: new PathGuard(resolver, { onWarning: (w) => warnings.push(w) }), warnings }
}

/** Builds `tree` under a fresh scratch directory, runs `run` on it, and removes it. */
function inScratch<T>(tree: Tree, run: (scratch: string) => T): T {
  const scratch = mkdtempSync(join(tmpdir(), 'path-guard-parity-'))
  try {
    for (const dir of tree.dirs ?? []) mkdirSync(join(scratch, dir), { recursive: true })
    for (const file of tree.files ?? []) writeFileSync(join(scratch, file), '')
    for (const [link, target] of Object.entries(tree.links ?? {})) {
      symlinkSync(target.startsWith('/') ? join(scratch, target) : target, join(scratch, link))
    }
    return run(scratch)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

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

/** Is the real path of `path` the real path of `root`, or beneath it? Both must exist. */
function landsIn(root: string, path: string): boolean {
  const [r, p] = [realpathSync.native(root), realpathSync.native(path)]
  return p === r || p.startsWith(r.endsWith(sep) ? r : r + sep)
}

describe('shared parity fixture', () => {
  test('this runner reads every section, and each has cases', () => {
    expect(Object.keys(f).filter((key) => !key.startsWith('_'))).toEqual(SECTIONS)
    for (const section of SECTIONS) expect(f[section].length).toBeGreaterThan(0)
  })

  describe('lexical.validateRelative', () => {
    for (const c of f.validate_relative) {
      test(c.name, () => {
        expect(outcome(() => lexical.validateRelative(c.input))).toEqual(expected(c))
      })
    }
  })

  // `lexical` reads no platform, so the warnings are the same on every host.
  describe('lexical.validateRelative warnings', () => {
    for (const c of f.windows_names) {
      test(c.name, () => {
        const warnings: PathWarning[] = []
        const got = outcome(() =>
          lexical.validateRelative(c.input, { onWarning: (w) => warnings.push(w) }),
        )
        if (c.error !== undefined) expect(got).toEqual({ error: c.error })
        else expect('ok' in got).toBe(true)
        expect(warnings).toEqual(c.warnings)
      })
    }
  })

  describe('guard.resolve', () => {
    for (const c of f.resolve) {
      test(c.name, () => {
        const got = outcome(() => new PathGuard(nothing).resolve(onHost(c.root), c.input))
        expect('ok' in got ? { ok: fromHost(got.ok) } : got).toEqual(expected(c))
      })
    }
  })

  describe(`guard.resolve with Windows names, on ${WINDOWS ? 'windows' : 'other'}`, () => {
    const root = WINDOWS ? 'C:\\v' : '/v'
    for (const c of f.resolve_windows_names) {
      test(c.name, () => {
        const { guard, warnings } = recording(nothing)
        const got = outcome(() => guard.resolve(root, c.input))
        const want = WINDOWS ? c.windows : c.other
        const shown = 'ok' in got ? { ok: slashed(got.ok) } : got
        const { ok, error } = expected(want) as { ok?: string; error?: string }
        expect(shown).toEqual(error !== undefined ? { error } : { ok: `${slashed(root)}/${ok}` })
        // On Windows the guard refuses instead of warning.
        expect(warnings).toEqual(WINDOWS ? [] : c.other.warnings)
      })
    }
  })

  describe('guard.contains', () => {
    for (const c of f.contains) {
      test(c.name, () => {
        const guard = new PathGuard(nothing)
        expect(outcome(() => guard.contains(onHost(c.outer), onHost(c.inner)))).toEqual(expected(c))
      })
    }
  })

  describe('lexical.absolute', () => {
    for (const c of f.absolute) {
      test(c.name, () => {
        expect(outcome(() => lexical.absolute(c.input, c.cwd))).toEqual(expected(c))
      })
    }
  })

  describe('lexical.isUnder', () => {
    for (const c of f.is_under) {
      test(c.name, () => {
        expect(outcome(() => lexical.isUnder(c.root, c.input))).toEqual(expected(c))
      })
    }
  })

  // `input` is the absolute path and `root` the root, as the Rust side's `to_relative`.
  describe('lexical.toRelative', () => {
    for (const c of f.to_relative) {
      test(c.name, () => {
        expect(outcome(() => lexical.toRelative(c.root, c.input))).toEqual(expected(c))
      })
    }
  })

  // A case with a `..` pins the POSIX rule, where `link/..` is the parent of the
  // link's target. Node on Windows folds `..` as text first, so there the guard
  // must agree with where the filesystem puts the path instead.
  const windowsDotDot = (c: object) => WINDOWS && JSON.stringify(c).includes('..')

  describe('nodeGuard.resolve on disk', () => {
    for (const c of f.resolve_on_disk) {
      test(c.name, () => {
        inScratch(c, (scratch) => {
          const root = join(scratch, c.root)
          if (windowsDotDot(c)) {
            // Asks the guard, then writes a file there and sees where it lands.
            const inside = nodeGuard.tryResolve(root, c.input) !== null
            const path = join(root, c.input)
            writeFileSync(path, '')
            expect(inside).toBe(landsIn(root, path))
            return
          }
          const got = outcome(() => nodeGuard.resolve(root, c.input))
          const shown = 'ok' in got ? { ok: slashed(got.ok.slice(scratch.length + 1)) } : got
          expect(shown).toEqual(expected(c))
        })
      })
    }
  })

  describe('nodeGuard.contains on disk', () => {
    for (const c of f.contains_on_disk) {
      test(c.name, () => {
        inScratch(c, (scratch) => {
          // Concatenated, not `join`ed, which would fold the `..`.
          const [outer, inner] = [`${scratch}/${c.outer}`, `${scratch}/${c.inner}`]
          const got = nodeGuard.contains(outer, inner)
          // Then create `inner` and see whether the filesystem put it inside `outer`.
          mkdirSync(inner, { recursive: true })
          expect(got).toBe(landsIn(outer, inner))
          if (!windowsDotDot(c)) expect({ ok: got }).toEqual(expected(c))
        })
      })
    }
  })

  // Windows folds `..` as text first, which gives the same answers for these cases.
  describe('nodeGuard.realPath on disk', () => {
    for (const c of f.real_path) {
      test(c.name, () => {
        inScratch(c, (scratch) => {
          const real = realpathSync.native(scratch)
          const rooted = (path: string) => (path.startsWith('/') ? join(real, path) : path)
          const got = outcome(() => nodeGuard.realPath(rooted(c.input)))
          const want = expected(c)
          expect('ok' in got ? { ok: slashed(got.ok) } : got).toEqual(
            'ok' in want ? { ok: slashed(rooted(want.ok as string)) } : want,
          )
        })
      })
    }
  })

  // The same sections through an in-memory `Resolver`: the guard needs no disk.
  // The tree follows the POSIX rules, so this runs where the guard does too.
  describe.skipIf(WINDOWS)('PathGuard over an in-memory filesystem', () => {
    const strip = (scratch: string, path: string) => path.slice(scratch.length + 1)

    describe('resolve_on_disk', () => {
      for (const c of f.resolve_on_disk) {
        test(c.name, () => {
          const { resolver, scratch } = memory(c)
          const got = outcome(() =>
            new PathGuard(resolver).resolve(`${scratch}/${c.root}`, c.input),
          )
          expect('ok' in got ? { ok: strip(scratch, got.ok) } : got).toEqual(expected(c))
        })
      }
    })

    describe('contains_on_disk', () => {
      for (const c of f.contains_on_disk) {
        test(c.name, () => {
          const { resolver, scratch } = memory(c)
          const guard = new PathGuard(resolver)
          expect(
            outcome(() => guard.contains(`${scratch}/${c.outer}`, `${scratch}/${c.inner}`)),
          ).toEqual(expected(c))
        })
      }
    })

    describe('real_path', () => {
      for (const c of f.real_path) {
        test(c.name, () => {
          const { resolver, scratch } = memory(c)
          const rooted = (path: string) => (path.startsWith('/') ? scratch + path : path)
          const got = outcome(() => new PathGuard(resolver).realPath(rooted(c.input)))
          const want = expected(c)
          expect(got).toEqual('ok' in want ? { ok: rooted(want.ok as string) } : want)
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
})
