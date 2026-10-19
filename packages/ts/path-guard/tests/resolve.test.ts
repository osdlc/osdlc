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
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  PathError,
  canonicalExistingPrefix,
  contains,
  MAX_LINK_HOPS,
  nodeResolver,
  realpathOrSelf,
  resolveInside,
  tryResolveInside,
  validateRelative,
  type Resolver,
} from '../index.ts'

/**
 * A resolver over a fixed table: `/` and each key of `entries` exist, and a key
 * resolves to its value. List each ancestor of a key, as the `Resolver`
 * contract requires. Each key of `links` is a symlink whose target text is its
 * value; list a link in `entries` too when its target exists.
 */
function table(entries: Record<string, string>, links: Record<string, string> = {}): Resolver {
  const lookup = (map: Record<string, string>, path: string) => {
    const to = map[path]
    if (to === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return to
  }
  return {
    realpath: (path) => (path === '/' ? '/' : lookup(entries, path)),
    readlink: (path) => lookup(links, path),
  }
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
// spelling exercises the canonical-root comparison.
let tmp: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'path-guard-'))
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('validateRelative', () => {
  test('throws a PathError naming the input', () => {
    const error = thrown(() => validateRelative('../etc/passwd'))
    expect(error).toBeInstanceOf(PathError)
    expect(error).toMatchObject({
      kind: 'parent_segment',
      message: 'path contains a parent-directory segment: "../etc/passwd"',
    })
  })
})

describe('resolveInside', () => {
  test('joins under the root', () => {
    expect(resolveInside(tmp, 'Notes/a.md')).toBe(join(tmp, 'Notes/a.md'))
  })

  test('allows a path that does not exist yet', () => {
    expect(resolveInside(tmp, 'brand/new/note.md')).toBe(join(tmp, 'brand/new/note.md'))
  })

  test('refuses a symlink that escapes the root', () => {
    const outside = join(tmp, 'outside')
    const vault = join(tmp, 'vault')
    mkdirSync(outside)
    mkdirSync(vault)
    writeFileSync(join(outside, 'secret.txt'), 'secret')
    symlinkSync(outside, join(vault, 'escape'))

    expect(validateRelative('escape/secret.txt')).toBe('escape/secret.txt')
    expect(kindOf(() => resolveInside(vault, 'escape/secret.txt'))).toBe('escapes')
    expect(kindOf(() => resolveInside(vault, 'escape/new.md'))).toBe('escapes')
  })

  test('accepts a symlink that stays inside', () => {
    mkdirSync(join(tmp, 'real'))
    writeFileSync(join(tmp, 'real', 'a.md'), 'x')
    symlinkSync(join(tmp, 'real'), join(tmp, 'alias'))
    expect(resolveInside(tmp, 'alias/a.md')).toBe(join(tmp, 'alias/a.md'))
  })

  test('refuses a symlink that leaves the root, through a resolver', () => {
    const fs = table({
      '/v': '/v',
      '/v/escape': '/outside',
      '/v/escape/secret.txt': '/outside/secret.txt',
    })
    expect(kindOf(() => resolveInside('/v', 'escape/secret.txt', fs))).toBe('escapes')
    expect(kindOf(() => resolveInside('/v', 'escape/new.md', fs))).toBe('escapes')
    expect(resolveInside('/v', 'Notes/a.md', fs)).toBe('/v/Notes/a.md')
  })

  test('finds a root one component under `/`, through a resolver', () => {
    const fs = table({ '/var': '/private/var' })
    expect(resolveInside('/var', 'a.md', fs)).toBe('/var/a.md')
    expect(canonicalExistingPrefix('/var/a.md', fs)).toBe('/private/var/a.md')
  })

  test('refuses a dangling symlink whose target would land outside', () => {
    const outside = join(tmp, 'outside')
    const vault = join(tmp, 'vault')
    mkdirSync(outside)
    mkdirSync(vault)
    symlinkSync(join(outside, 'planted.json'), join(vault, 'x.json'))

    expect(kindOf(() => resolveInside(vault, 'x.json'))).toBe('escapes')
    // The premise: a write through the link creates the file outside.
    writeFileSync(join(vault, 'x.json'), '{}')
    expect(existsSync(join(outside, 'planted.json'))).toBe(true)
  })

  test('resolves a relative dangling target against the link directory', () => {
    mkdirSync(join(tmp, 'vault/sub'), { recursive: true })
    symlinkSync('../new.json', join(tmp, 'vault/sub/in.json'))
    symlinkSync('../../planted.json', join(tmp, 'vault/sub/out.json'))
    const vault = join(tmp, 'vault')
    expect(resolveInside(vault, 'sub/in.json')).toBe(join(vault, 'sub/in.json'))
    expect(kindOf(() => resolveInside(vault, 'sub/out.json'))).toBe('escapes')
  })

  test('refuses a symlink loop', () => {
    symlinkSync('b', join(tmp, 'a'))
    symlinkSync('a', join(tmp, 'b'))
    expect(kindOf(() => resolveInside(tmp, 'a'))).toBe('escapes')
    expect(contains(tmp, join(tmp, 'a'))).toBe(false)
    expect(canonicalExistingPrefix(join(tmp, 'a/x.md'))).toBe(join(tmp, 'a/x.md'))
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
    expect(resolveInside(join(tmp, 'ok'), 'l0')).toBe(join(tmp, 'ok/l0'))
    expect(kindOf(() => resolveInside(join(tmp, 'over'), 'l0'))).toBe('escapes')
  })

  test('follows a dangling symlink, through a resolver', () => {
    const fs = table({ '/v': '/v' }, { '/v/out.json': '/outside/p.json', '/v/in.json': 'new.json' })
    expect(kindOf(() => resolveInside('/v', 'out.json', fs))).toBe('escapes')
    expect(resolveInside('/v', 'in.json', fs)).toBe('/v/in.json')
    expect(canonicalExistingPrefix('/v/in.json', fs)).toBe('/v/new.json')
  })

  test('measures against the canonical root and returns the joined spelling', () => {
    const fs = table({ '/var': '/private/var', '/var/v': '/private/var/v' })
    expect(resolveInside('/var/v', 'a.md', fs)).toBe('/var/v/a.md')
  })
})

describe('contains', () => {
  test('sees a path that only lands inside after dots fold', () => {
    const vault = join(tmp, 'vault-b')
    mkdirSync(vault)
    const sneaky = join(tmp, 'nope') + '/../vault-b/out'
    expect(contains(vault, sneaky)).toBe(true)
    mkdirSync(sneaky, { recursive: true })
    expect(realpathSync(sneaky).startsWith(realpathSync(vault) + '/')).toBe(true)
  })

  test('is component-wise, so a name prefix is not a parent', () => {
    const vault = join(tmp, 'vault-b')
    mkdirSync(vault)
    mkdirSync(join(tmp, 'vault-bee'))
    expect(contains(vault, vault)).toBe(true)
    expect(contains(vault, join(vault, 'out/deep'))).toBe(true)
    expect(contains(vault, join(tmp, 'vault-bee', 'out'))).toBe(false)
  })

  test('resolves a root reached through a symlink', () => {
    const vault = join(tmp, 'vault-b')
    mkdirSync(vault)
    const alias = join(tmp, 'alias')
    symlinkSync(vault, alias)
    expect(contains(vault, join(alias, 'out'))).toBe(true)
    expect(contains(alias, join(vault, 'out'))).toBe(true)
  })

  test('resolves a `..` behind a symlink the way the filesystem does', () => {
    const vault = join(tmp, 'v')
    mkdirSync(join(vault, 'deep'), { recursive: true })
    mkdirSync(join(tmp, 'x'))
    const link = join(tmp, 'x', 'link')
    symlinkSync(join(vault, 'deep'), link)

    const inner = `${link}/../y`
    expect(contains(vault, inner)).toBe(true)
    // The filesystem's own verdict on where it lands. Not `realpathSync`, which
    // folds the `..` textually.
    mkdirSync(inner, { recursive: true })
    expect(existsSync(join(vault, 'y'))).toBe(true)
  })

  test('follows a dangling symlink to where its target would land', () => {
    const vault = join(tmp, 'vault')
    mkdirSync(vault)
    mkdirSync(join(tmp, 'outside'))
    symlinkSync(join(tmp, 'outside/planted.json'), join(vault, 'x.json'))
    expect(contains(vault, join(vault, 'x.json'))).toBe(false)
    expect(contains(join(tmp, 'outside'), join(vault, 'x.json'))).toBe(true)
  })

  test('folds a trailing `..` behind a missing component, through a resolver', () => {
    const fs = table({ '/tmp': '/private/tmp', '/tmp/v': '/private/tmp/v' })
    expect(contains('/tmp/v', '/tmp/nope/../v/out', fs)).toBe(true)
    expect(contains('/tmp/v', '/tmp/nope/../w/out', fs)).toBe(false)
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
    expect(contains(tmp, inner, counting)).toBe(true)
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
    expect(contains(tmp, inner, counting)).toBe(true)
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
      expect(tryResolveInside(root, input, fs)).toBeNull()
      expect(fs.calls).toBeLessThan(2000)
    }
  })

  test('spends calls on a dangling link through `..` pairs in proportion to its target', () => {
    const root = join(tmp, 'root')
    mkdirSync(root)
    symlinkSync(`${'zz/../'.repeat(160)}new.md`, join(root, 'd'))
    const fs = counting()
    expect(resolveInside(root, 'd', fs)).toBe(join(root, 'd'))
    expect(fs.calls).toBeLessThan(2 * 160 + 64)
  })

  // A ratio, not a wall-clock bound, so a busy machine slows both runs alike. Four times the
  // pairs costs about four times the time when linear, and sixteen times when quadratic.
  test('folds `zz/..` pairs in linear calls and time', { timeout: 120_000 }, () => {
    /** Fastest of three runs over `pairs` pairs, and the calls one run spends. */
    const fold = (pairs: number) => {
      const fs = counting()
      const inner = `${tmp}/${'zz/../'.repeat(pairs)}out`
      let best = Infinity
      for (let run = 0; run < 3; run++) {
        const started = performance.now()
        expect(contains(tmp, inner, fs)).toBe(true)
        best = Math.min(best, performance.now() - started)
      }
      return { ms: best, calls: fs.calls / 3 }
    }
    fold(500)
    const n = 2500
    const [small, large] = [fold(n), fold(4 * n)]
    expect(large.ms / small.ms).toBeLessThan(8)
    expect(large.calls).toBeLessThan(2 * 4 * n + 64)
  })

  test('resolves a `..` behind a symlink physically, through a resolver', () => {
    const fs = table({ '/v': '/v', '/x': '/x', '/x/link': '/v/deep', '/x/link/..': '/v' })
    expect(contains('/v', '/x/link/../y', fs)).toBe(true)
  })
})

describe('nodeResolver', () => {
  test('throws ENOTDIR for `..` after a file', () => {
    writeFileSync(join(tmp, 'f'), '')
    expect(() => nodeResolver.realpath(`${join(tmp, 'f')}/..`)).toThrow(/ENOTDIR/)
  })

  test('throws ENOENT for the empty path', () => {
    expect(() => nodeResolver.realpath('')).toThrow(/ENOENT/)
  })
})

describe('realpathOrSelf', () => {
  test('resolves `..` behind a symlink to the parent of its target', () => {
    mkdirSync(join(tmp, 'v/deep'), { recursive: true })
    mkdirSync(join(tmp, 'x'))
    symlinkSync(join(tmp, 'v/deep'), join(tmp, 'x/link'))
    expect(realpathOrSelf(`${join(tmp, 'x/link')}/..`)).toBe(realpathSync(join(tmp, 'v')))
  })

  test('folds `..` behind a missing name against the real path', () => {
    expect(realpathOrSelf(`${tmp}/a/../missing`)).toBe(join(realpathSync(tmp), 'missing'))
  })

  test('folds `..` after a link and a missing name against the link target', () => {
    mkdirSync(join(tmp, 'v/deep/deeper'), { recursive: true })
    mkdirSync(join(tmp, 'x'))
    symlinkSync(join(tmp, 'v/deep/deeper'), join(tmp, 'x/link'))
    const real = realpathSync(tmp)
    expect(realpathOrSelf(`${tmp}/x/link/missing/..`)).toBe(join(real, 'v/deep/deeper'))
    expect(realpathOrSelf(`${tmp}/x/link/missing/../..`)).toBe(join(real, 'v/deep'))
    expect(realpathOrSelf(`${tmp}/x/link/missing/../../../y`)).toBe(join(real, 'v/y'))
  })

  test('resolves a link reached again after a missing name folds away', () => {
    mkdirSync(join(tmp, 'v/deep'), { recursive: true })
    symlinkSync(join(tmp, 'v/deep'), join(tmp, 'link'))
    expect(realpathOrSelf(`${tmp}/missing/../link/../y`)).toBe(join(realpathSync(tmp), 'v/y'))
  })

  test('folds `..` as text when the walk gives up on a link loop', () => {
    symlinkSync('loop', join(tmp, 'loop'))
    expect(realpathOrSelf(`${tmp}/loop/../x`)).toBe(join(tmp, 'x'))
  })

  test('resolves symlinks in a path that exists', () => {
    symlinkSync(tmp, join(tmp, 'self'))
    expect(realpathOrSelf(join(tmp, 'self'))).toBe(realpathSync(tmp))
  })

  test('returns the real path of the existing part when the path does not exist', () => {
    expect(realpathOrSelf(join(tmp, 'missing'))).toBe(join(realpathSync(tmp), 'missing'))
  })

  test('makes a relative path absolute', () => {
    expect(realpathOrSelf('no-such-entry')).toBe(join(realpathSync(process.cwd()), 'no-such-entry'))
  })
})

describe('relative paths', () => {
  const cwd = process.cwd()
  let realTmp: string

  beforeEach(() => {
    realTmp = realpathSync(tmp)
    mkdirSync(join(tmp, 'vault/sub'), { recursive: true })
    process.chdir(tmp)
  })

  afterEach(() => {
    process.chdir(cwd)
  })

  test('canonicalExistingPrefix resolves from the first segment', () => {
    expect(canonicalExistingPrefix('vault/a.md')).toBe(`${realTmp}/vault/a.md`)
    expect(canonicalExistingPrefix('./a.md')).toBe(`${realTmp}/a.md`)
    expect(canonicalExistingPrefix('vault/sub/new/a.md')).toBe(`${realTmp}/vault/sub/new/a.md`)
    expect(canonicalExistingPrefix('nope/a.md')).toBe('nope/a.md')
  })

  test('resolveInside joins under a relative root', () => {
    expect(resolveInside('vault', 'a.md')).toBe('vault/a.md')
    expect(resolveInside('vault', 'sub/new/a.md')).toBe('vault/sub/new/a.md')
  })

  test('contains sees a relative path inside a relative root', () => {
    expect(contains('vault', 'vault/new.md')).toBe(true)
    expect(contains('vault', 'vault/sub/new/a.md')).toBe(true)
    expect(contains('vault', 'other/a.md')).toBe(false)
  })

  test('works through a resolver', () => {
    const fs = table({ vault: '/abs/vault', 'vault/sub': '/abs/vault/sub' })
    expect(canonicalExistingPrefix('vault/a.md', fs)).toBe('/abs/vault/a.md')
    expect(contains('vault', 'vault/sub/new/a.md', fs)).toBe(true)
  })

  test('realpathOrSelf joins a relative path onto a working directory of `/`', () => {
    // `/` already ends in a separator, and `joinPath` adds none. A template string
    // would add one, and `components` would drop it again, so the answer does not
    // change: this guards the join, not the output.
    process.chdir('/')
    expect(realpathOrSelf('no-such-entry')).toBe('/no-such-entry')
  })
})

describe('tryResolveInside', () => {
  test('returns the joined path when the path stays inside', () => {
    expect(tryResolveInside('/v', 'a.md', table({ '/v': '/v' }))).toBe('/v/a.md')
  })

  test('returns null for a lexical refusal instead of throwing', () => {
    expect(tryResolveInside('/v', '../a.md', table({ '/v': '/v' }))).toBeNull()
    expect(tryResolveInside('/v', '/etc/passwd', table({ '/v': '/v' }))).toBeNull()
  })
})
