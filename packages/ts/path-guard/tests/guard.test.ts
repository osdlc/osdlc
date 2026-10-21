import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  MAX_LINK_HOPS,
  PathError,
  PathGuard,
  lexical,
  type PathWarning,
  type Resolver,
} from '../index.ts'
import { nodeGuard, nodeResolver } from '../node.ts'

/**
 * A resolver over a fixed table: `/` and each key of `entries` exist, and a key
 * resolves to its value. List each ancestor of a key, as the `Resolver`
 * contract requires. Each key of `links` is a symlink whose target text is its
 * value; list a link in `entries` too when its target exists.
 */
function table(entries: Record<string, string>, links: Record<string, string> = {}): Resolver {
  const onHost = (map: Record<string, string>) =>
    Object.fromEntries(Object.entries(map).map(([key, to]) => [at(key), at(to)]))
  const [real, link] = [onHost(entries), onHost(links)]
  const lookup = (map: Record<string, string>, path: string) => {
    const to = map[path]
    if (to === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return to
  }
  return {
    realpath: (path) => (path === at('/') ? path : lookup(real, path)),
    readlink: (path) => lookup(link, path),
  }
}

/**
 * A POSIX-style absolute path on this host. The guard takes `/v` as absolute
 * on POSIX only, so on Windows the path goes on drive `C:`. A relative path is
 * left as it is.
 */
function at(path: string): string {
  return WINDOWS && path.startsWith('/') ? `C:${path}` : path
}

function thrown(run: () => unknown): unknown {
  try {
    run()
  } catch (e) {
    return e
  }
  return null
}

function kindOf(run: () => unknown): string | null {
  const e = thrown(run)
  if (e === null) return null
  if (e instanceof PathError) return e.kind
  throw e
}

// `tmpdir()` on macOS is under `/var`, a symlink to `/private/var`, so the raw
// spelling exercises the canonical-root comparison. On Windows it can hold a
// short (8.3) name, which only `realpathSync.native` expands.
let tmp: string

const WINDOWS = process.platform === 'win32'
/** A test of the POSIX `..` rule: `link/..` is the parent of the link's target. Windows folds `..` as text first. */
const posixOnly = test.skipIf(WINDOWS)

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'path-guard-'))
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('lexical.validateRelative', () => {
  test('throws a PathError naming the input', () => {
    const error = thrown(() => lexical.validateRelative('../etc/passwd'))
    expect(error).toBeInstanceOf(PathError)
    expect(error).toMatchObject({
      kind: 'parent_segment',
      message: 'path contains a parent-directory segment: "../etc/passwd"',
    })
  })
})

describe('guard.resolve', () => {
  test('joins under the root', () => {
    expect(nodeGuard.resolve(tmp, 'Notes/a.md')).toBe(join(tmp, 'Notes/a.md'))
  })

  test('allows a path that does not exist yet', () => {
    expect(nodeGuard.resolve(tmp, 'brand/new/note.md')).toBe(join(tmp, 'brand/new/note.md'))
  })

  test('refuses a symlink that escapes the root', () => {
    const outside = join(tmp, 'outside')
    const vault = join(tmp, 'vault')
    mkdirSync(outside)
    mkdirSync(vault)
    writeFileSync(join(outside, 'secret.txt'), 'secret')
    symlinkSync(outside, join(vault, 'escape'))

    expect(lexical.validateRelative('escape/secret.txt')).toBe('escape/secret.txt')
    expect(kindOf(() => nodeGuard.resolve(vault, 'escape/secret.txt'))).toBe('escapes')
    expect(kindOf(() => nodeGuard.resolve(vault, 'escape/new.md'))).toBe('escapes')
  })

  test('accepts a symlink that stays inside', () => {
    mkdirSync(join(tmp, 'real'))
    writeFileSync(join(tmp, 'real', 'a.md'), 'x')
    symlinkSync(join(tmp, 'real'), join(tmp, 'alias'))
    expect(nodeGuard.resolve(tmp, 'alias/a.md')).toBe(join(tmp, 'alias/a.md'))
  })

  test('refuses a symlink that leaves the root, through a resolver', () => {
    const fs = table({
      '/v': '/v',
      '/v/escape': '/outside',
      '/v/escape/secret.txt': '/outside/secret.txt',
    })
    expect(kindOf(() => new PathGuard(fs).resolve(at('/v'), 'escape/secret.txt'))).toBe('escapes')
    expect(kindOf(() => new PathGuard(fs).resolve(at('/v'), 'escape/new.md'))).toBe('escapes')
    expect(new PathGuard(fs).resolve(at('/v'), 'Notes/a.md')).toBe(join(at('/v/Notes/a.md')))
  })

  test('finds a root one component under `/`, through a resolver', () => {
    const fs = table({ '/var': '/private/var' })
    expect(new PathGuard(fs).resolve(at('/var'), 'a.md')).toBe(join(at('/var/a.md')))
    expect(new PathGuard(fs).realPath(at('/var/a.md'))).toBe(join(at('/private/var/a.md')))
  })

  test('refuses a dangling symlink whose target would land outside', () => {
    const outside = join(tmp, 'outside')
    const vault = join(tmp, 'vault')
    mkdirSync(outside)
    mkdirSync(vault)
    symlinkSync(join(outside, 'planted.json'), join(vault, 'x.json'))

    expect(kindOf(() => nodeGuard.resolve(vault, 'x.json'))).toBe('escapes')
    // The premise: a write through the link creates the file outside.
    writeFileSync(join(vault, 'x.json'), '{}')
    expect(existsSync(join(outside, 'planted.json'))).toBe(true)
  })

  test('resolves a relative dangling target against the link directory', () => {
    mkdirSync(join(tmp, 'vault/sub'), { recursive: true })
    symlinkSync('../new.json', join(tmp, 'vault/sub/in.json'))
    symlinkSync('../../planted.json', join(tmp, 'vault/sub/out.json'))
    const vault = join(tmp, 'vault')
    expect(nodeGuard.resolve(vault, 'sub/in.json')).toBe(join(vault, 'sub/in.json'))
    expect(kindOf(() => nodeGuard.resolve(vault, 'sub/out.json'))).toBe('escapes')
  })

  test('refuses a symlink loop', () => {
    symlinkSync('b', join(tmp, 'a'))
    symlinkSync('a', join(tmp, 'b'))
    expect(kindOf(() => nodeGuard.resolve(tmp, 'a'))).toBe('unresolvable')
    expect(nodeGuard.contains(tmp, join(tmp, 'a'))).toBe(false)
    expect(nodeGuard.realPath(join(tmp, 'a/x.md'))).toBe(join(tmp, 'a/x.md'))
  })

  test('follows MAX_LINK_HOPS links and refuses one more', () => {
    /** A chain of `n` dangling links in `dir`: `l0 -> l1 -> … -> end.json`. */
    const chain = (dir: string, n: number) => {
      mkdirSync(dir)
      for (let i = 0; i < n; i++) {
        symlinkSync(i + 1 === n ? 'end.json' : `l${i + 1}`, join(dir, `l${i}`))
      }
    }
    chain(join(tmp, 'ok'), MAX_LINK_HOPS)
    chain(join(tmp, 'over'), MAX_LINK_HOPS + 1)
    expect(nodeGuard.resolve(join(tmp, 'ok'), 'l0')).toBe(join(tmp, 'ok/l0'))
    expect(kindOf(() => nodeGuard.resolve(join(tmp, 'over'), 'l0'))).toBe('unresolvable')
  })

  test('follows a dangling symlink, through a resolver', () => {
    const fs = table({ '/v': '/v' }, { '/v/out.json': '/outside/p.json', '/v/in.json': 'new.json' })
    expect(kindOf(() => new PathGuard(fs).resolve(at('/v'), 'out.json'))).toBe('escapes')
    expect(new PathGuard(fs).resolve(at('/v'), 'in.json')).toBe(join(at('/v/in.json')))
    expect(new PathGuard(fs).realPath(at('/v/in.json'))).toBe(join(at('/v/new.json')))
  })

  test('measures against the canonical root and returns the joined spelling', () => {
    const fs = table({ '/var': '/private/var', '/var/v': '/private/var/v' })
    expect(new PathGuard(fs).resolve(at('/var/v'), 'a.md')).toBe(join(at('/var/v/a.md')))
  })
})

describe('guard.contains', () => {
  test('sees a path that only lands inside after dots fold', () => {
    const vault = join(tmp, 'vault-b')
    mkdirSync(vault)
    const sneaky = join(tmp, 'nope') + '/../vault-b/out'
    expect(nodeGuard.contains(vault, sneaky)).toBe(true)
    mkdirSync(sneaky, { recursive: true })
    expect(realpathSync.native(sneaky).startsWith(realpathSync.native(vault) + sep)).toBe(true)
  })

  test('is component-wise, so a name prefix is not a parent', () => {
    const vault = join(tmp, 'vault-b')
    mkdirSync(vault)
    mkdirSync(join(tmp, 'vault-bee'))
    expect(nodeGuard.contains(vault, vault)).toBe(true)
    expect(nodeGuard.contains(vault, join(vault, 'out/deep'))).toBe(true)
    expect(nodeGuard.contains(vault, join(tmp, 'vault-bee', 'out'))).toBe(false)
  })

  test('resolves a root reached through a symlink', () => {
    const vault = join(tmp, 'vault-b')
    mkdirSync(vault)
    const alias = join(tmp, 'alias')
    symlinkSync(vault, alias)
    expect(nodeGuard.contains(vault, join(alias, 'out'))).toBe(true)
    expect(nodeGuard.contains(alias, join(vault, 'out'))).toBe(true)
  })

  test('resolves a `..` behind a symlink the way the filesystem does', () => {
    const vault = join(tmp, 'v')
    mkdirSync(join(vault, 'deep'), { recursive: true })
    mkdirSync(join(tmp, 'x'))
    const link = join(tmp, 'x', 'link')
    symlinkSync(join(vault, 'deep'), link)

    const inner = `${link}/../y`
    const inside = nodeGuard.contains(vault, inner)
    // POSIX puts `link/..` at the parent of the link's target. Windows folds the
    // `..` as text, so it lands beside the link.
    expect(inside).toBe(!WINDOWS)
    // The filesystem's own verdict on where it lands. Not `realpathSync`, which
    // folds the `..` textually.
    mkdirSync(inner, { recursive: true })
    expect(existsSync(join(vault, 'y'))).toBe(inside)
  })

  test('follows a dangling symlink to where its target would land', () => {
    const vault = join(tmp, 'vault')
    mkdirSync(vault)
    mkdirSync(join(tmp, 'outside'))
    symlinkSync(join(tmp, 'outside/planted.json'), join(vault, 'x.json'))
    expect(nodeGuard.contains(vault, join(vault, 'x.json'))).toBe(false)
    expect(nodeGuard.contains(join(tmp, 'outside'), join(vault, 'x.json'))).toBe(true)
  })

  test('folds a trailing `..` behind a missing component, through a resolver', () => {
    const fs = table({ '/tmp': '/private/tmp', '/tmp/v': '/private/tmp/v' })
    expect(new PathGuard(fs).contains(at('/tmp/v'), at('/tmp/nope/../v/out'))).toBe(true)
    expect(new PathGuard(fs).contains(at('/tmp/v'), at('/tmp/nope/../w/out'))).toBe(false)
  })

  test('bounds the resolver calls, however long the missing tail', () => {
    mkdirSync(join(tmp, 'docs'))
    const calls: string[] = []
    const counting: Resolver = {
      realpath: (path) => {
        calls.push(path)
        return nodeResolver.realpath(path)
      },
      readlink: (path) => nodeResolver.readlink(path),
    }
    const inner = `${tmp}/${'docs/../'.repeat(500)}${'zz/'.repeat(300)}`
    expect(new PathGuard(counting).contains(tmp, inner)).toBe(true)
    expect(calls.length).toBeLessThan(40)
  })

  test('spends few resolver calls on each `..` behind a missing name', () => {
    let calls = 0
    const counting: Resolver = {
      realpath: (path) => {
        calls++
        return nodeResolver.realpath(path)
      },
      readlink: (path) => nodeResolver.readlink(path),
    }
    // Each `zz/..` folds back onto the root, so the walk resumes there.
    const inner = `${tmp}/${'zz/../'.repeat(40)}${'zz/'.repeat(200)}`
    expect(new PathGuard(counting).contains(tmp, inner)).toBe(true)
    expect(calls).toBeLessThan(3 * 40)
  })

  /** {@link nodeResolver}, counting every call. */
  function counting(): Resolver & { calls: number } {
    const r = {
      calls: 0,
      realpath: (path: string) => {
        r.calls++
        return nodeResolver.realpath(path)
      },
      readlink: (path: string) => {
        r.calls++
        return nodeResolver.readlink(path)
      },
    }
    return r
  }

  // A link target of `zz/..` pairs is walked again on every hop, so a loop of such links must be
  // refused before the hops multiply the pairs.
  test('refuses a link loop through `..` pairs within a fixed number of calls', () => {
    const root = join(tmp, 'root')
    mkdirSync(root)
    const pairs = 'zz/../'.repeat(160)
    symlinkSync(`${pairs}l`, join(root, 'l'))
    symlinkSync(`${pairs}b`, join(root, 'a'))
    symlinkSync(`${pairs}a`, join(root, 'b'))
    for (const input of ['l/x.md', 'a/x.md']) {
      const fs = counting()
      expect(new PathGuard(fs).tryResolve(root, input)).toBeNull()
      expect(fs.calls).toBeLessThan(2000)
    }
  })

  test('spends calls on a dangling link through `..` pairs in proportion to its target', () => {
    const root = join(tmp, 'root')
    mkdirSync(root)
    symlinkSync(`${'zz/../'.repeat(160)}new.md`, join(root, 'd'))
    const fs = counting()
    expect(new PathGuard(fs).resolve(root, 'd')).toBe(join(root, 'd'))
    expect(fs.calls).toBeLessThan(2 * 160 + 64)
  })

  // A ratio, not a wall-clock bound, so a busy machine slows both runs alike. Eight times the
  // pairs costs about 8 times the time when linear and 64 times when quadratic. The bound of 24
  // leaves about 3 times room on each side. The call count only sees resolver calls, so the
  // time ratio is what catches quadratic string work.
  test('folds `zz/..` pairs in linear calls and time', { timeout: 120_000 }, () => {
    /** Fastest of three runs over `pairs` pairs, and the calls one run spends. */
    const fold = (pairs: number) => {
      const fs = counting()
      const inner = `${tmp}/${'zz/../'.repeat(pairs)}out`
      let best = Infinity
      for (let run = 0; run < 3; run++) {
        const started = performance.now()
        expect(new PathGuard(fs).contains(tmp, inner)).toBe(true)
        best = Math.min(best, performance.now() - started)
      }
      return { ms: best, calls: fs.calls / 3 }
    }
    const n = 2500
    fold(n)
    const [small, large] = [fold(n), fold(8 * n)]
    expect(large.ms / small.ms).toBeLessThan(24)
    expect(large.calls).toBeLessThan(2 * 8 * n + 64)
  })

  posixOnly('resolves a `..` behind a symlink physically, through a resolver', () => {
    const fs = table({ '/v': '/v', '/x': '/x', '/x/link': '/v/deep', '/x/link/..': '/v' })
    expect(new PathGuard(fs).contains('/v', '/x/link/../y')).toBe(true)
  })
})

describe('nodeResolver', () => {
  posixOnly('throws ENOTDIR for `..` after a file', () => {
    writeFileSync(join(tmp, 'f'), '')
    expect(() => nodeResolver.realpath(`${join(tmp, 'f')}/..`)).toThrow(/ENOTDIR/)
  })

  test('throws ENOENT for the empty path', () => {
    expect(() => nodeResolver.realpath('')).toThrow(/ENOENT/)
  })
})

describe('guard.realPath', () => {
  test('resolves `..` behind a symlink as the OS does', () => {
    mkdirSync(join(tmp, 'v/deep'), { recursive: true })
    mkdirSync(join(tmp, 'x'))
    symlinkSync(join(tmp, 'v/deep'), join(tmp, 'x/link'))
    // POSIX: the parent of the link's target. Windows: the link's own directory.
    expect(nodeGuard.realPath(`${join(tmp, 'x/link')}/..`)).toBe(
      realpathSync.native(join(tmp, WINDOWS ? 'x' : 'v')),
    )
  })

  test('folds `..` behind a missing name against the real path', () => {
    expect(nodeGuard.realPath(`${tmp}/a/../missing`)).toBe(
      join(realpathSync.native(tmp), 'missing'),
    )
  })

  posixOnly('folds `..` after a link and a missing name against the link target', () => {
    mkdirSync(join(tmp, 'v/deep/deeper'), { recursive: true })
    mkdirSync(join(tmp, 'x'))
    symlinkSync(join(tmp, 'v/deep/deeper'), join(tmp, 'x/link'))
    const real = realpathSync.native(tmp)
    expect(nodeGuard.realPath(`${tmp}/x/link/missing/..`)).toBe(join(real, 'v/deep/deeper'))
    expect(nodeGuard.realPath(`${tmp}/x/link/missing/../..`)).toBe(join(real, 'v/deep'))
    expect(nodeGuard.realPath(`${tmp}/x/link/missing/../../../y`)).toBe(join(real, 'v/y'))
  })

  posixOnly('resolves a link reached again after a missing name folds away', () => {
    mkdirSync(join(tmp, 'v/deep'), { recursive: true })
    symlinkSync(join(tmp, 'v/deep'), join(tmp, 'link'))
    expect(nodeGuard.realPath(`${tmp}/missing/../link/../y`)).toBe(
      join(realpathSync.native(tmp), 'v/y'),
    )
  })

  // On Windows the `..` folds away before the loop is reached.
  posixOnly('folds `..` as text when the walk gives up on a link loop', () => {
    symlinkSync('loop', join(tmp, 'loop'))
    expect(nodeGuard.realPath(`${tmp}/loop/../x`)).toBe(join(tmp, 'x'))
  })

  test('resolves symlinks in a path that exists', () => {
    symlinkSync(tmp, join(tmp, 'self'))
    expect(nodeGuard.realPath(join(tmp, 'self'))).toBe(realpathSync.native(tmp))
  })

  test('returns the real path of the existing part when the path does not exist', () => {
    expect(nodeGuard.realPath(join(tmp, 'missing'))).toBe(join(realpathSync.native(tmp), 'missing'))
  })

  test('refuses a relative or empty path, and reads no working directory', () => {
    const cwd = vi.spyOn(process, 'cwd')
    try {
      expect(kindOf(() => nodeGuard.realPath('no-such-entry'))).toBe('not_absolute')
      expect(kindOf(() => nodeGuard.realPath(''))).toBe('not_absolute')
      expect(cwd).not.toHaveBeenCalled()
    } finally {
      cwd.mockRestore()
    }
  })
})

describe('relative input', () => {
  const fs = table({ '/v': '/v' })
  const guard = new PathGuard(fs)

  test('the guard refuses a relative root, outer or inner, and an empty root', () => {
    expect(kindOf(() => guard.resolve('v', 'a.md'))).toBe('not_absolute')
    expect(kindOf(() => guard.resolve('', 'a.md'))).toBe('empty_root')
    expect(kindOf(() => guard.contains('v', at('/v/a')))).toBe('not_absolute')
    expect(kindOf(() => guard.contains(at('/v'), 'v/a'))).toBe('not_absolute')
    expect(kindOf(() => guard.contains('', at('/v/a')))).toBe('empty_root')
    expect(guard.tryResolve('v', 'a.md')).toBeNull()
  })

  test('the message names the argument', () => {
    expect(thrown(() => guard.contains(at('/v'), 'v/a'))).toMatchObject({
      kind: 'not_absolute',
      message: 'inner must be absolute, got "v/a"',
    })
    expect(thrown(() => guard.resolve('', 'a.md'))).toMatchObject({
      kind: 'empty_root',
      message: 'root is empty',
    })
  })

  test('never reads the working directory', () => {
    const cwd = vi.spyOn(process, 'cwd')
    try {
      guard.tryResolve('v', 'a.md')
      guard.resolve(at('/v'), 'a.md')
      thrown(() => guard.contains('v', 'v/a'))
      guard.contains(at('/v'), at('/v/a'))
      expect(cwd).not.toHaveBeenCalled()
    } finally {
      cwd.mockRestore()
    }
  })
})

describe('lexical.absolute', () => {
  test('reads no working directory and follows no symlink', () => {
    const cwd = vi.spyOn(process, 'cwd')
    try {
      expect(lexical.absolute('a/../b', '/w')).toBe('/w/b')
      expect(lexical.absolute('/srv/link/../x', '/w')).toBe('/srv/x')
      expect(cwd).not.toHaveBeenCalled()
    } finally {
      cwd.mockRestore()
    }
  })
})

// Outcomes are in the parity fixture. This checks the error message, which it does not hold.
describe('lexical.toRelative', () => {
  test('throws a PathError that names the paths', () => {
    expect(thrown(() => lexical.toRelative('/v', '/other/a.md'))).toMatchObject({
      kind: 'not_under_root',
      message: 'path is not under the root: "/other/a.md" does not start with "/v"',
    })
    const error = thrown(() => lexical.toRelative('/v', '/v/a/../b'))
    expect(error).toBeInstanceOf(PathError)
    expect(error).toMatchObject({
      kind: 'parent_segment',
      message: 'path contains a parent-directory segment: "a/../b"',
    })
  })
})

describe('guard.tryResolve', () => {
  const fs = table({ '/v': '/v' })

  test('returns the joined path when the path stays inside', () => {
    expect(new PathGuard(fs).tryResolve(at('/v'), 'a.md')).toBe(join(at('/v/a.md')))
  })

  test('returns null for a lexical refusal instead of throwing', () => {
    expect(new PathGuard(fs).tryResolve(at('/v'), '../a.md')).toBeNull()
    expect(new PathGuard(fs).tryResolve(at('/v'), '/etc/passwd')).toBeNull()
  })

  test('lets an error that is not a PathError through', () => {
    const failure = new Error('disk on fire')
    const broken: Resolver = {
      realpath: () => {
        throw failure
      },
      readlink: () => {
        throw failure
      },
    }
    // The walk treats a throw as "does not exist", so a failing resolver gives
    // the joined path. A throw from the warning handler is not caught.
    expect(new PathGuard(broken).tryResolve(at('/v'), 'a.md')).toBe(join(at('/v/a.md')))
    const loud = new PathGuard(fs, {
      onWarning: () => {
        throw failure
      },
    })
    if (!WINDOWS) expect(thrown(() => loud.tryResolve('/v', 'NUL'))).toBe(failure)
  })
})

// The Windows refusals are in tests/windows-paths.test.ts and the parity fixture.
describe.skipIf(WINDOWS)('Windows names, on other platforms', () => {
  const fs = table({ '/v': '/v' })

  test('resolve accepts the path and calls onWarning once per match, in order', () => {
    const warnings: PathWarning[] = []
    const guard = new PathGuard(fs, { onWarning: (w) => warnings.push(w) })
    expect(guard.resolve('/v', 'NUL/a:b')).toBe('/v/NUL/a:b')
    expect(warnings).toEqual([
      { kind: 'reserved_name', segment: 'NUL' },
      { kind: 'alternate_stream', segment: 'a:b' },
    ])
  })

  test('onWarning is not called for a path the guard refuses', () => {
    const warnings: PathWarning[] = []
    const guard = new PathGuard(table({ '/v': '/v', '/v/out': '/outside' }), {
      onWarning: (w) => warnings.push(w),
    })
    expect(kindOf(() => guard.resolve('/v', 'out/NUL'))).toBe('escapes')
    expect(guard.tryResolve('/v', '../NUL')).toBeNull()
    expect(warnings).toEqual([])
  })

  test('with no onWarning, nothing is printed', () => {
    const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((name) =>
      vi.spyOn(console, name).mockImplementation(() => {}),
    )
    const writes = [vi.spyOn(process.stdout, 'write'), vi.spyOn(process.stderr, 'write')]
    try {
      expect(new PathGuard(fs).resolve('/v', 'CON')).toBe('/v/CON')
      expect(nodeGuard.tryResolve('/v', 'ab:c')).toBe('/v/ab:c')
      expect(lexical.validateRelative('NUL')).toBe('NUL')
      for (const spy of [...spies, ...writes]) expect(spy).not.toHaveBeenCalled()
    } finally {
      for (const spy of [...spies, ...writes]) spy.mockRestore()
    }
  })

  test('contains and realPath do not check the names', () => {
    const warnings: PathWarning[] = []
    const guard = new PathGuard(fs, { onWarning: (w) => warnings.push(w) })
    expect(guard.contains('/v', '/v/NUL')).toBe(true)
    expect(guard.realPath('/v/a:b')).toBe('/v/a:b')
    expect(warnings).toEqual([])
  })
})
