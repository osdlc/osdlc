import { chmodSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { spawnRunnerBytes } from '@osdlc/command-seam'
import { describe, expect, test } from 'vitest'

import { parseDiff } from '../src/diff/parse.ts'

import { readFiles } from '../src/files/read.ts'
import { readObjects, streamObjects } from '../src/git/blobs.ts'
import { changeSpecFrom, parseChangeSpec, readDiff, resolveChange } from '../src/git/change.ts'
import { openRepo } from '../src/git/repo.ts'
import { linguistAttributes, listTree } from '../src/git/tree.ts'
import { checkAttr, MACRO_CASE } from './check-attr.ts'
import { CodeStatsError } from '../src/error.ts'
import { testRepo } from './repo-fixture.ts'

describe('parseChangeSpec', () => {
  test('reads PRs, revision pairs and lone refs', () => {
    expect(parseChangeSpec('123')).toEqual({ kind: 'pr', number: 123 })
    expect(parseChangeSpec('#7')).toEqual({ kind: 'pr', number: 7 })
    expect(parseChangeSpec('a..b')).toEqual({ kind: 'range', base: 'a', head: 'b' })
    expect(parseChangeSpec('main...feat')).toEqual({
      kind: 'merge-base',
      base: 'main',
      head: 'feat',
    })
    expect(parseChangeSpec('v1.0')).toEqual({ kind: 'merge-base', base: 'v1.0', head: 'HEAD' })
    expect(parseChangeSpec('a..')).toEqual({ kind: 'range', base: 'a', head: 'HEAD' })
    expect(parseChangeSpec('a...')).toEqual({ kind: 'merge-base', base: 'a', head: 'HEAD' })
  })

  test('refuses what is not a change', () => {
    for (const bad of ['', '0', '#0', '..b', '...b', 'a..b..c', '99999999999999999999']) {
      expect(() => parseChangeSpec(bad), bad).toThrow(CodeStatsError)
    }
  })
})

describe('changeSpecFrom', () => {
  test('maps each selector to its change', () => {
    expect(changeSpecFrom({})).toBeNull()
    expect(changeSpecFrom({ pr: 7 })).toEqual({ kind: 'pr', number: 7 })
    expect(changeSpecFrom({ base: 'a' })).toEqual({ kind: 'merge-base', base: 'a', head: 'HEAD' })
    expect(changeSpecFrom({ base: 'a', head: 'b' })).toEqual({
      kind: 'range',
      base: 'a',
      head: 'b',
    })
    expect(changeSpecFrom({ worktree: true })).toEqual({ kind: 'worktree' })
    expect(changeSpecFrom({ worktree: true, base: 'a' })).toEqual({ kind: 'worktree', base: 'a' })
  })

  test('refuses contradictory selectors as bad input', () => {
    for (const bad of [
      { pr: 7, base: 'a' },
      { pr: 7, worktree: true },
      { head: 'b' },
      { base: 'a', head: 'b', worktree: true },
    ]) {
      expect(() => changeSpecFrom(bad), JSON.stringify(bad)).toThrow(
        expect.objectContaining({ kind: 'bad-input' }),
      )
    }
  })
})

describe('resolveChange and readDiff', () => {
  test('a range is exact, a merge-base pair is what the head added', () => {
    const r = testRepo()
    const first = r.commit('one', { 'a.txt': 'a\n' })
    r.git('switch', '-q', '-c', 'feat')
    const feat = r.commit('feat', { 'b.txt': 'b\n' })
    r.git('switch', '-q', 'main')
    const main = r.commit('main moves', { 'c.txt': 'c\n' })
    const repo = r.open()

    const range = resolveChange(repo, { kind: 'range', base: 'main', head: 'feat' })
    expect(range).toMatchObject({ label: 'main..feat', base: main, head: feat })
    expect(readDiff(repo, range)).toContain('c.txt')

    const branch = resolveChange(repo, { kind: 'merge-base', base: 'main', head: 'feat' })
    expect(branch).toMatchObject({ label: 'main...feat', base: first, head: feat })
    const diff = readDiff(repo, branch)
    expect(diff).toContain('b.txt')
    expect(diff).not.toContain('c.txt')
  })

  test('the working tree includes untracked files and not ignored ones', () => {
    const r = testRepo()
    r.commit('one', { 'a.txt': 'a\n', '.gitignore': 'ignored.txt\n' })
    r.write({ 'a.txt': 'a\nmore\n', 'new.txt': 'new\n', 'ignored.txt': 'x\n' })
    const repo = r.open()
    const change = resolveChange(repo, { kind: 'worktree' })
    expect(change).toMatchObject({ kind: 'worktree', head: null })
    const diff = readDiff(repo, change)
    expect(diff).toContain('+more')
    expect(diff).toContain('b/new.txt')
    expect(diff).not.toContain('ignored.txt')
  })

  test("with a base, a branch's commits and its uncommitted edits read as one change", () => {
    const r = testRepo()
    const base = r.commit('one', { 'a.txt': 'a\n' })
    r.git('switch', '-q', '-c', 'feature')
    r.commit('two', { 'b.txt': 'b\n' })
    r.git('switch', '-q', 'main')
    r.commit('main moves on', { 'm.txt': 'm\n' })
    r.git('switch', '-q', 'feature')
    r.write({ 'dirty.txt': 'uncommitted\n' })
    const repo = r.open()
    const change = resolveChange(repo, { kind: 'worktree', base: 'main' })
    expect(change).toMatchObject({ kind: 'worktree', label: 'main...worktree', base, head: null })
    const diff = readDiff(repo, change)
    expect(diff).toContain('b/b.txt')
    expect(diff).toContain('+uncommitted')
    expect(diff).not.toContain('m.txt')
  })

  test("no spec means the branch against the remote's default branch", () => {
    const r = testRepo()
    const base = r.commit('one', { 'a.txt': 'a\n' })
    r.git('update-ref', 'refs/remotes/origin/trunk', base)
    r.git('update-ref', 'refs/remotes/origin/main', r.commit('two', { 'a.txt': 'b\n' }))
    r.git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk')
    expect(resolveChange(r.open(), null)).toMatchObject({ label: 'origin/trunk...HEAD', base })
  })

  test('no spec and no origin/HEAD means the branch against origin/main', () => {
    const r = testRepo()
    const base = r.commit('one', { 'a.txt': 'a\n' })
    r.git('update-ref', 'refs/remotes/origin/main', base)
    const head = r.commit('two', { 'a.txt': 'b\n' })
    expect(resolveChange(r.open(), null)).toMatchObject({
      label: 'origin/main...HEAD',
      base,
      head,
    })
  })

  test('without origin, a default base is a clear error', () => {
    const r = testRepo()
    r.commit('one')
    expect(() => resolveChange(r.open(), null)).toThrow(/no origin\/HEAD or origin\/main/)
  })

  test('an unknown revision is a usage error', () => {
    const r = testRepo()
    r.commit('one')
    const err = (() => {
      try {
        resolveChange(r.open(), { kind: 'range', base: 'nope', head: 'HEAD' })
      } catch (e) {
        return e
      }
      return null
    })()
    expect(err).toBeInstanceOf(CodeStatsError)
    expect((err as CodeStatsError).kind).toBe('bad-input')
  })

  test('a PR whose commits are here is diffed locally; otherwise GitHub’s diff is used', () => {
    const r = testRepo()
    const base = r.commit('one', { 'a.txt': 'a\n' })
    const head = r.commit('two', { 'a.txt': 'b\n' })
    const view = (b: string, h: string) => ({
      stdout: JSON.stringify({ baseRefOid: b, headRefOid: h }),
    })

    const local = r.open({ 'pr view 5 --json baseRefOid,headRefOid': view(base, head) })
    expect(resolveChange(local, { kind: 'pr', number: 5 })).toMatchObject({
      label: 'PR #5',
      pr: 5,
      base,
      head,
    })

    const missing = 'f'.repeat(40)
    const remote = r.open({
      'pr view 6 --json baseRefOid,headRefOid': view(base, missing),
      'pr diff 6': { stdout: 'diff --git a/x b/x\n' },
    })
    const change = resolveChange(remote, { kind: 'pr', number: 6 })
    expect(change).toMatchObject({ base: null, head: null, pr: 6 })
    expect(readDiff(remote, change)).toBe('diff --git a/x b/x\n')
  })
})

const WINDOWS = process.platform === 'win32'

describe('untracked files in the working-tree diff', () => {
  // Windows forbids `"`, `\` and control characters in a file name.
  const ODD_NAMES: Record<string, string> = {
    'é "quoted"\\name.md': '# hi\n',
    'tab\there.txt': 'x\n',
  }
  const FILES: Record<string, string | Buffer> = {
    'text.ts': 'export const a = 1\nexport const b = 2\n',
    'one line.txt': 'one',
    'crlf.txt': 'a\r\nb\r\n',
    'empty.txt': '',
    ...(WINDOWS ? {} : ODD_NAMES),
    'bin.dat': Buffer.from([1, 0, 2, 0x0a, 3]),
    'forced.lock': 'text but -diff\n',
    'forced.bin': Buffer.from('a\0b\n'),
    'bad-utf8.txt': Buffer.from([0x61, 0xff, 0x0a]),
    'run.sh': '#!/bin/sh\necho\n',
  }

  test('text, binary by content or attribute, odd names and symlinks', () => {
    const r = testRepo()
    r.commit('one', { '.gitattributes': '*.lock -diff\n*.bin diff\n' })
    r.write(FILES)
    chmodSync(join(r.dir, 'run.sh'), 0o755)
    // Windows has no executable bit, and a symlink there needs a privilege.
    if (!WINDOWS) symlinkSync('text.ts', join(r.dir, 'link'))
    const repo = r.open()
    const untracked = repo.git.lsFiles({ others: true, excludeStandard: true })
    expect(untracked).toHaveLength(Object.keys(FILES).length + (WINDOWS ? 0 : 1))
    const parsed = parseDiff(readDiff(repo, resolveChange(repo, { kind: 'worktree' })))
    expect(parsed.map((f) => f.path).sort()).toEqual([...untracked].sort())
    expect(
      parsed
        .filter((f) => f.binary)
        .map((f) => f.path)
        .sort(),
    ).toEqual(['bin.dat', 'forced.lock'])
    if (!WINDOWS) expect(parsed.find((f) => f.path === 'link')?.entry).toBe('symlink')
    expect(parsed.find((f) => f.path === 'crlf.txt')?.added.map((l) => l.text)).toEqual(['a', 'b'])
  })
})

describe('blobs and trees', () => {
  test('reads text, binary, oversized and missing objects in one pass', () => {
    const r = testRepo()
    r.commit('one', {
      'a.ts': 'const a = 1\n',
      'b.bin': Buffer.from([1, 0, 2]),
      'big.txt': 'x'.repeat(50),
      'sp ace.txt': 'with space\n',
    })
    const repo = r.open()
    const blobs = readObjects(
      repo,
      ['HEAD:a.ts', 'HEAD:b.bin', 'HEAD:big.txt', 'HEAD:nope', 'HEAD:sp ace.txt', 'bad\nname'],
      40,
    )
    expect(blobs.get('HEAD:a.ts')).toEqual({ kind: 'text', text: 'const a = 1\n' })
    expect(blobs.get('HEAD:b.bin')).toEqual({ kind: 'binary', bytes: 3 })
    expect(blobs.get('HEAD:big.txt')).toEqual({ kind: 'too-large', bytes: 50 })
    expect(blobs.get('HEAD:nope')).toEqual({ kind: 'missing' })
    expect(blobs.get('HEAD:sp ace.txt')).toEqual({ kind: 'text', text: 'with space\n' })
    expect(blobs.get('bad\nname')).toEqual({ kind: 'missing' })
  })

  test('a read split over several --batch runs hands each file its own bytes', () => {
    const r = testRepo()
    r.commit('one', {
      'a.txt': 'first\n',
      'b.bin': Buffer.from([0, 1, 2, 3]),
      'c.txt': 'third one\n',
    })
    const repo = r.open()
    let runs = 0
    const counted = {
      ...repo,
      gitBytes: {
        ...repo.gitBytes,
        run: (argv: string[], opts: Parameters<typeof repo.gitBytes.run>[1]) => {
          if (argv.includes('--batch')) runs += 1
          return repo.gitBytes.run(argv, opts)
        },
      },
    }
    const blobs = readObjects(counted, ['HEAD:a.txt', 'HEAD:b.bin', 'HEAD:c.txt'], 100, 1)
    expect(runs).toBe(3)
    expect(blobs.get('HEAD:a.txt')).toEqual({ kind: 'text', text: 'first\n' })
    expect(blobs.get('HEAD:b.bin')).toEqual({ kind: 'binary', bytes: 4 })
    expect(blobs.get('HEAD:c.txt')).toEqual({ kind: 'text', text: 'third one\n' })
  })

  test('a stream reads one batch at a time and answers repeats from an earlier batch', () => {
    const r = testRepo()
    r.commit('one', { 'a.txt': 'same\n', 'b.txt': 'other\n', 'c.txt': 'third\n' })
    const repo = r.open()
    let runs = 0
    const counted = {
      ...repo,
      gitBytes: {
        ...repo.gitBytes,
        run: (argv: string[], opts: Parameters<typeof repo.gitBytes.run>[1]) => {
          if (argv.includes('--batch')) runs += 1
          return repo.gitBytes.run(argv, opts)
        },
      },
    }
    const names = [
      'HEAD:a.txt',
      'HEAD:b.txt',
      'HEAD:a.txt',
      'HEAD:nope',
      'HEAD:c.txt',
      'HEAD:a.txt',
    ]
    const stream = streamObjects(counted, names, 100, 1)
    const seen: [string, unknown, number][] = []
    for (const [name, content] of stream) seen.push([name, content, runs])
    expect(seen).toEqual([
      ['HEAD:a.txt', { kind: 'text', text: 'same\n' }, 1],
      ['HEAD:b.txt', { kind: 'text', text: 'other\n' }, 2],
      ['HEAD:a.txt', { kind: 'text', text: 'same\n' }, 2],
      ['HEAD:nope', { kind: 'missing' }, 2],
      ['HEAD:c.txt', { kind: 'text', text: 'third\n' }, 3],
      ['HEAD:a.txt', { kind: 'text', text: 'same\n' }, 3],
    ])
  })

  test('lists regular files of a revision and of the working tree', () => {
    const r = testRepo()
    r.write({ 'src/a.ts': 'a\n', 'src/b.ts': 'b\n', 'docs/x.md': 'x\n', '.gitignore': 'out/\n' })
    symlinkSync('a.ts', join(r.dir, 'src/link.ts'))
    const head = r.commit('one')
    r.remove('src/b.ts')
    r.write({ 'src/new.ts': 'n\n', 'out/skip.ts': 's\n' })
    const repo = r.open()

    expect(listTree(repo, head, []).map((f) => f.path)).toEqual([
      '.gitignore',
      'docs/x.md',
      'src/a.ts',
      'src/b.ts',
    ])
    expect(listTree(repo, head, ['src']).map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts'])
    const files = readFiles(repo.root, ['src/a.ts', 'src/b.ts', 'src'])
    expect(files.get('src/a.ts')).toEqual({ kind: 'text', text: 'a\n' })
    expect(files.get('src/b.ts')).toEqual({ kind: 'missing' })
    expect(files.get('src')).toEqual({ kind: 'missing' })
  })

  test('reads linguist attributes at a revision and in the working tree', () => {
    const r = testRepo()
    const head = r.commit('one', {
      '.gitattributes': 'gen/** linguist-generated\nkeep.min.js -linguist-generated\n',
      'gen/a.ts': 'a\n',
    })
    r.write({ '.gitattributes': 'docs/** linguist-documentation\n' })
    const repo = r.open()
    const paths = ['gen/a.ts', 'keep.min.js', 'docs/x.ts', 'plain.ts']
    expect(linguistAttributes(repo, paths, head)).toEqual(
      new Map([
        ['gen/a.ts', { generated: true }],
        ['keep.min.js', { generated: false }],
      ]),
    )
    expect(linguistAttributes(repo, paths, null)).toEqual(
      new Map([['docs/x.ts', { documentation: true }]]),
    )
  })

  test('at a commit, attributes match git check-attr --source, nested .gitattributes included', () => {
    const r = testRepo()
    const head = r.commit('one', {
      '.gitattributes': '*.gen.ts linguist-generated\nvendor/** linguist-vendored\n',
      'sub/.gitattributes': 'local.ts linguist-generated\n*.gen.ts -linguist-generated\n',
      'sub/deeper/.gitattributes': '/anchored.ts linguist-documentation\n',
      'a.gen.ts': 'a\n',
    })
    r.write({ '.git/info/attributes': 'top.ts linguist-generated\n' })
    const repo = r.open()
    const paths = [
      'a.gen.ts',
      'vendor/x/y.js',
      'sub/local.ts',
      'sub/b.gen.ts',
      'sub/deeper/anchored.ts',
      'sub/deeper/z/anchored.ts',
      'top.ts',
      'plain.ts',
    ]
    const ours = linguistAttributes(repo, paths, head)
    expect(Object.fromEntries(ours)).toEqual(Object.fromEntries(checkAttr(repo, paths, head)))
    expect(ours.size).toBe(6)
  })

  test('at a commit, [attr] macros expand as git check-attr --source expands them', () => {
    const r = testRepo()
    const head = r.commit('macros', MACRO_CASE.files)
    // The working tree says otherwise, so a reader that looked there would differ.
    r.write({ '.gitattributes': '', '.git/info/attributes': MACRO_CASE.info })
    const repo = r.open()
    const paths = [...MACRO_CASE.paths]
    const ours = linguistAttributes(repo, paths, head)
    expect(Object.fromEntries(ours)).toEqual(Object.fromEntries(checkAttr(repo, paths, head)))
    expect(ours.get('dist/a.js')).toEqual({ generated: true })
    expect(ours.size).toBeGreaterThan(8)
  })

  test('a cat-file that cannot run says why, and carries the classified failure', () => {
    const r = testRepo()
    r.commit('one', { 'a.ts': 'a\n' })
    const repo = { ...r.open(), gitBytes: spawnRunnerBytes('git-is-not-installed') }
    let thrown: unknown
    try {
      readObjects(repo, ['HEAD:a.ts'])
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(CodeStatsError)
    expect((thrown as CodeStatsError).message).toMatch(/^git cat-file failed: .*not installed/)
    expect((thrown as CodeStatsError).failure?.kind).toBe('not-installed')
  })

  test("a failed git command's error names the command's first line of error", () => {
    const r = testRepo()
    r.commit('one', { 'a.ts': 'a\n' })
    expect(() => listTree(r.open(), 'nope', [])).toThrow(/^could not list nope: fatal: /)
  })

  test('opening a directory outside a repository fails clearly', () => {
    expect(() => openRepo(tmpdir())).toThrow(CodeStatsError)
  })
})

describe('review regressions', () => {
  test('a working-tree symlink reads as its target path, as git stores it', () => {
    const r = testRepo()
    r.commit('one', { 'a.ts': 'export const a = 1\n' })
    symlinkSync('a.ts', join(r.dir, 'link.ts'))
    expect(readFiles(r.open().root, ['link.ts']).get('link.ts')).toEqual({
      kind: 'text',
      text: 'a.ts',
    })
  })

  test('a PR in a shallow clone, with no merge base, falls back to GitHub’s diff', () => {
    const r = testRepo()
    r.commit('one', { 'a.txt': 'a\n' })
    const base = r.git('commit-tree', '-m', 'orphan', r.git('write-tree'))
    const head = r.commit('two', { 'a.txt': 'b\n' })
    const repo = r.open({
      'pr view 9 --json baseRefOid,headRefOid': {
        stdout: JSON.stringify({ baseRefOid: base, headRefOid: head }),
      },
    })
    expect(resolveChange(repo, { kind: 'pr', number: 9 })).toMatchObject({
      base: null,
      head: null,
    })
  })

  test('an untracked nested repository is left out of the working-tree diff', () => {
    const r = testRepo()
    r.commit('one', { 'a.txt': 'a\n' })
    r.git('init', '-q', 'nested')
    r.write({ 'nested/x.txt': 'x\n', 'new.txt': 'n\n' })
    const repo = r.open()
    const diff = readDiff(repo, resolveChange(repo, { kind: 'worktree' }))
    expect(diff).toContain('b/new.txt')
    expect(diff).not.toContain('nested')
  })
})

test('a submodule bump stays one entry, whatever diff.submodule says', () => {
  const inner = testRepo()
  inner.commit('one', { 'x.txt': 'x\n' })
  const r = testRepo()
  r.commit('base', { 'a.txt': 'a\n' })
  r.git('-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', inner.dir, 'sm')
  r.git('commit', '-q', '-m', 'add sm')
  inner.commit('two', { 'x.txt': 'y\n' })
  r.git('-C', 'sm', 'pull', '-q', 'origin', 'main')
  r.git('commit', '-q', '-am', 'bump sm')
  r.git('config', 'diff.submodule', 'diff')
  const repo = r.open()
  const diff = readDiff(repo, resolveChange(repo, { kind: 'range', base: 'HEAD~1', head: 'HEAD' }))
  expect(diff).toContain('Subproject commit')
  expect(diff).not.toContain('x.txt')
})
