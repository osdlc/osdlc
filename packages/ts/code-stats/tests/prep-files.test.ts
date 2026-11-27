import { afterEach, describe, expect, test } from 'vitest'
import { rmSync } from 'node:fs'
import { join } from 'node:path'

import { splitEven } from '../src/prep/split.ts'
import { buildGroups, nearestRoot, packageRoots } from '../src/prep/groups.ts'
import { branchRepo, cleanupFixtures, prep, put } from './prep-helpers.ts'

afterEach(cleanupFixtures)

describe('prep files', () => {
  test('each drop reason, and kept changes (comment-only included) beside them', () => {
    const { fx } = branchRepo(
      {
        '.gitattributes': 'cli/app.js linguist-generated\nthird/** linguist-vendored\n',
        'bun.lock': 'a\n',
        'cli/app.js': 'old\n',
        'third/lib.ts': 'export const t = 1\n',
        'src/fmt.ts': 'export const a = {b:1,c:2}\n',
        'src/doc.ts': 'export const a = 1\n// old note\n',
        'src/logic.ts': 'export const a = 1\n',
      },
      {
        'bun.lock': 'b\n',
        'cli/app.js': 'new\n',
        'third/lib.ts': 'export const t = 2\n',
        'src/fmt.ts': 'export const a = { b: 1, c: 2 }\n',
        'src/doc.ts': 'export const a = 1\n// new note\n',
        'src/logic.ts': 'export const a = 2\n',
      },
    )
    const out = prep(fx)
    expect(out.schema).toBe(2)
    expect(out.coverage).toEqual(['ts'])
    // The groups and categories are code-stats': a lockfile is generated, and
    // linguist attributes mark the generated and vendored files.
    expect(out.files.dropped).toEqual([
      { path: 'bun.lock', reason: 'generated' },
      { path: 'cli/app.js', reason: 'generated' },
      { path: 'src/fmt.ts', reason: 'formatting-only' },
      { path: 'third/lib.ts', reason: 'vendored' },
    ])
    expect(out.files.kept).toEqual([
      {
        path: 'src/doc.ts',
        status: 'modified',
        group: 'source',
        category: 'comments',
        language: 'TypeScript',
        added: 1,
        removed: 1,
      },
      {
        path: 'src/logic.ts',
        status: 'modified',
        group: 'source',
        category: 'logic',
        language: 'TypeScript',
        added: 1,
        removed: 1,
      },
    ])
  })

  test('added and deleted files are kept with their status', () => {
    const { fx } = branchRepo(
      { 'old.ts': 'export const x = 1\n' },
      { 'old.ts': null, 'new.ts': 'export const y = 1\n' },
    )
    const out = prep(fx)
    expect(out.files.kept.map((f) => [f.path, f.status])).toEqual([
      ['new.ts', 'added'],
      ['old.ts', 'deleted'],
    ])
  })
})

describe('splitEven', () => {
  test('spreads evenly and can be switched off', () => {
    expect(splitEven([1, 2, 3, 4, 5], 4)).toEqual([
      [1, 2, 3],
      [4, 5],
    ])
    expect(splitEven([1, 2, 3], 4)).toEqual([[1, 2, 3]])
    expect(splitEven([1, 2, 3, 4, 5], 0)).toEqual([[1, 2, 3, 4, 5]])
  })
  test('never leaves a near-empty last slice', () => {
    const sizes = (n: number, limit: number) =>
      splitEven(
        Array.from({ length: n }, (_, i) => i),
        limit,
      ).map((s) => s.length)
    expect(sizes(13, 4)).toEqual([4, 3, 3, 3])
    expect(sizes(10, 3)).toEqual([3, 3, 2, 2])
    expect(sizes(13, 5)).toEqual([5, 4, 4])
    expect(sizes(24, 12)).toEqual([12, 12])
    expect(splitEven([1, 2, 3, 4, 5, 6, 7], 3).flat()).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
})

const kept = (path: string, added = 1) => ({
  path,
  status: 'modified' as const,
  group: 'source' as const,
  category: 'logic' as const,
  language: 'TypeScript',
  added,
  removed: 0,
})

describe('package roots', () => {
  const tree = [
    'package.json',
    'packages/a/package.json',
    'packages/a/src/x.ts',
    'packages/a/vendored/inner/Cargo.toml',
    'crates/c/Cargo.toml',
    'py/pyproject.toml',
    'svc/go.mod',
    'svc/cmd/main.go',
    'docs/readme.md',
  ]

  test('markers name the directories that hold them', () => {
    expect([...packageRoots(tree)].sort()).toEqual([
      '.',
      'crates/c',
      'packages/a',
      'packages/a/vendored/inner',
      'py',
      'svc',
    ])
    expect(
      [...packageRoots(['deno.json', 'x/pom.xml', 'y/build.gradle.kts', 'z/build.gradle'])].sort(),
    ).toEqual(['.', 'x', 'y', 'z'])
  })

  test('a file takes the nearest ancestor root; none means the repo root', () => {
    const roots = packageRoots(tree.filter((p) => p !== 'package.json'))
    expect(nearestRoot('packages/a/src/x.ts', roots)).toBe('packages/a')
    expect(nearestRoot('packages/a/vendored/inner/lib/y.rs', roots)).toBe(
      'packages/a/vendored/inner',
    )
    expect(nearestRoot('svc/cmd/main.go', roots)).toBe('svc')
    expect(nearestRoot('docs/readme.md', roots)).toBe('.')
    expect(nearestRoot('top.ts', roots)).toBe('.')
  })

  test('a root marker makes the top a package like any other', () => {
    expect(nearestRoot('docs/readme.md', packageRoots(tree))).toBe('.')
  })
})

describe('buildGroups', () => {
  test('groups by nearest root, in root order, with line totals', () => {
    const roots = packageRoots(['packages/a/package.json', 'packages/a/inner/package.json'])
    const groups = buildGroups(
      [
        kept('packages/a/src/x.ts', 3),
        kept('packages/a/inner/z.ts'),
        kept('packages/a/b.ts'),
        kept('root.ts'),
      ],
      roots,
      2,
    )
    expect(groups.map((g) => [g.id, g.roots, g.files, g.lines])).toEqual([
      ['g1', ['.'], ['root.ts'], 1],
      ['g2', ['packages/a'], ['packages/a/b.ts', 'packages/a/src/x.ts'], 4],
      ['g3', ['packages/a/inner'], ['packages/a/inner/z.ts'], 1],
    ])
  })

  test('small groups pack in root order up to the limit and list every root', () => {
    const roots = new Set(['a', 'b', 'c', 'zbig'])
    const files = [
      kept('a/x.ts'),
      kept('b/x.ts'),
      kept('c/x.ts'),
      ...Array.from({ length: 13 }, (_, i) => kept(`zbig/f${String(i).padStart(2, '0')}.ts`)),
    ]
    const groups = buildGroups(files, roots, 12)
    expect(groups.map((g) => [g.id, g.roots, g.files.length])).toEqual([
      ['g1', ['a', 'b', 'c', 'zbig'], 10],
      ['g2', ['zbig'], 6],
    ])
    // limit 0: no splitting and no packing, one group per root
    expect(buildGroups(files, roots, 0)).toHaveLength(4)
    const lone = Array.from({ length: 30 }, (_, i) => kept(`p${String(i).padStart(2, '0')}/x.ts`))
    const many = buildGroups(lone, new Set(lone.map((f) => f.path.split('/')[0]!)), 12)
    expect(many.map((g) => g.files.length)).toEqual([12, 12, 6])
  })

  test('a large group splits evenly in path order and keeps its root', () => {
    const files = Array.from({ length: 13 }, (_, i) =>
      kept(`lib/f${String(i).padStart(2, '0')}.ts`),
    )
    const roots = new Set(['lib'])
    const groups = buildGroups(files, roots, 12)
    expect(groups.map((g) => [g.roots, g.files.length])).toEqual([
      [['lib'], 7],
      [['lib'], 6],
    ])
    expect(groups[0]!.files[0]).toBe('lib/f00.ts')
    expect(groups[1]!.files[0]).toBe('lib/f07.ts')
    expect(buildGroups(files, roots, 5).map((g) => g.files.length)).toEqual([5, 4, 4])
    expect(buildGroups(files, roots, 0)).toHaveLength(1)
  })
})

describe('prep groups', () => {
  const many = (dir: string, n: number) =>
    Object.fromEntries(
      Array.from({ length: n }, (_, i) => [`${dir}/f${i}.ts`, `export const v = ${i}\n`]),
    )

  test('groups follow package roots read at the head commit', () => {
    const { fx } = branchRepo(
      { 'packages/ts/a/package.json': '{}\n' },
      {
        'packages/ts/a/src/x.ts': 'export const x = 1\n',
        'packages/ts/a/src/deep/y.ts': 'export const y = 1\n',
        'packages/ts/b/package.json': '{}\n',
        'packages/ts/b/z.ts': 'export const z = 1\n',
        'root.ts': 'export const r = 1\n',
        'docs/n.ts': 'export const n = 1\n',
      },
    )
    const out = prep(fx, { thresholds: { groupSize: 2 } })
    const expected = [
      ['g1', ['.'], ['docs/n.ts', 'root.ts']],
      ['g2', ['packages/ts/a'], ['packages/ts/a/src/deep/y.ts', 'packages/ts/a/src/x.ts']],
      ['g3', ['packages/ts/b'], ['packages/ts/b/package.json', 'packages/ts/b/z.ts']],
    ]
    expect(out.groups.map((g) => [g.id, g.roots, g.files])).toEqual(expected)
    expect(out.groups[1]!.lines).toBe(2)
    // From a subdirectory the same paths and roots come out: the repo top level is used.
    const sub = prep(fx, { cwd: join(fx.dir, 'packages/ts/a/src'), thresholds: { groupSize: 2 } })
    expect(sub.groups.map((g) => [g.id, g.roots, g.files])).toEqual(expected)
    // Default size packs the three small groups into one.
    expect(prep(fx).groups.map((g) => g.roots)).toEqual([['.', 'packages/ts/a', 'packages/ts/b']])
  })

  test('--base with --worktree reads the branch and its uncommitted edits together', () => {
    const { fx } = branchRepo(
      { 'a.ts': 'export const a = 1\n' },
      { 'b.ts': 'export const b = 1\n' },
    )
    put(fx, 'c.ts', 'export const c = 1\n')
    const out = prep(fx, { base: 'main', worktree: true })
    expect(out.change.label).toBe('main...worktree')
    expect(out.files.kept.map((f) => f.path).sort()).toEqual(['b.ts', 'c.ts'])
    expect(() => prep(fx, { base: 'main', head: 'HEAD', worktree: true })).toThrow(
      '--head and --worktree are mutually exclusive',
    )
  })

  test('worktree mode: a marker deleted in the working tree is not a root', () => {
    const { fx } = branchRepo(
      { 'lib/package.json': '{}\n' },
      { 'lib/x.ts': 'export const x = 1\n' },
    )
    rmSync(join(fx.dir, 'lib/package.json'))
    put(fx, 'lib/y.ts', 'export const y = 1\n')
    const out = prep(fx, { base: null, worktree: true })
    expect(out.groups.map((g) => g.roots)).toEqual([['.']])
  })

  test('an oversized group is split evenly and keeps its root', () => {
    const { fx } = branchRepo({ 'lib/package.json': '{}\n' }, many('lib', 13))
    const out = prep(fx)
    expect(out.thresholds.groupSize).toBe(12)
    expect(out.groups.map((g) => [g.roots, g.files.length])).toEqual([
      [['lib'], 7],
      [['lib'], 6],
    ])
    const small = prep(fx, { thresholds: { groupSize: 5 } })
    expect(small.groups.map((g) => g.files.length)).toEqual([5, 4, 4])
  })

  test('group size 0 disables splitting', () => {
    const { fx } = branchRepo({ 'lib/package.json': '{}\n' }, many('lib', 13))
    const out = prep(fx, { thresholds: { groupSize: 0 } })
    expect(out.groups).toHaveLength(1)
    expect(out.groups[0]!.files).toHaveLength(13)
  })
})
