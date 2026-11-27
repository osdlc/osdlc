import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import { CodeStatsError } from '../src/error.ts'
import { readLinguistAttributes } from '../src/files/attributes.ts'
import { countDirectory } from '../src/files/count.ts'
import { readFiles } from '../src/files/read.ts'
import { listFiles } from '../src/files/walk.ts'
import { checkAttr, MACRO_CASE } from './check-attr.ts'
import { countReportSchema } from '../src/report/schema.ts'
import { testRepo } from './repo-fixture.ts'

const made: string[] = []
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** A directory holding `files`, with no git repository unless a `.git` is among them. */
function folder(files: Record<string, string | Buffer>): string {
  const dir = mkdtempSync(join(tmpdir(), 'code-stats-files-'))
  made.push(dir)
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), content)
  }
  return dir
}

describe('listFiles', () => {
  test('follows .gitignore files on the way down, the last matching rule winning', () => {
    const dir = folder({
      '.gitignore': 'dist/\n*.log\n',
      'a.ts': '',
      'b.log': '',
      'dist/out.js': '',
      'sub/.gitignore': '!keep.log\nlocal.ts\n',
      'sub/keep.log': '',
      'sub/local.ts': '',
      'sub/x.ts': '',
    })
    expect(listFiles(dir)).toEqual([
      '.gitignore',
      'a.ts',
      'sub/.gitignore',
      'sub/keep.log',
      'sub/x.ts',
    ])
    expect(listFiles(dir, ['sub/x.ts', 'a.ts'])).toEqual(['a.ts', 'sub/x.ts'])
  })

  test('skips version-control metadata, installed packages and symlinks', () => {
    const dir = folder({
      '.git': 'gitdir: elsewhere\n',
      '.hg/store': '',
      'node_modules/x/index.js': '',
      'src/a.ts': '',
    })
    symlinkSync(join(dir, 'src'), join(dir, 'linked'))
    symlinkSync(join(dir, 'src', 'a.ts'), join(dir, 'b.ts'))
    expect(listFiles(dir)).toEqual(['src/a.ts'])
  })

  test('inside a repository, submodules and nested repositories are left out, as git leaves them', () => {
    const dir = folder({
      '.git/HEAD': '',
      'a.ts': '',
      'sub/.git': 'gitdir: ../.git/modules/sub\n',
      'sub/b.ts': '',
      'nested/.git/HEAD': '',
      'nested/c.ts': '',
    })
    expect(listFiles(dir, [], true)).toEqual(['a.ts'])
    expect(listFiles(dir)).toEqual(['a.ts', 'nested/c.ts', 'sub/b.ts'])
  })

  test("reads info/exclude from a worktree's common git directory", () => {
    const dir = folder({
      'main/.git/info/exclude': 'secret.txt\n',
      'main/.git/worktrees/wt/commondir': '../..\n',
      'wt/.git': '',
      'wt/secret.txt': '',
      'wt/a.ts': '',
    })
    writeFileSync(join(dir, 'wt/.git'), `gitdir: ${join(dir, 'main/.git/worktrees/wt')}\n`)
    expect(listFiles(join(dir, 'wt'))).toEqual(['a.ts'])
    const counted = countDirectory({ dir: join(dir, 'wt'), detail: true })
    expect(counted.fileList?.map((f) => f.path)).toEqual(['a.ts'])
  })
})

describe('readLinguistAttributes', () => {
  test('reads .gitattributes as git does: deeper files and later lines win', () => {
    const dir = folder({
      '.gitattributes':
        'gen/** linguist-generated\n*.min.js linguist-vendored\ndocs/ linguist-documentation\n',
      'gen/.gitattributes': 'keep.ts -linguist-generated\nclear.ts !linguist-generated\n',
    })
    const out = readLinguistAttributes(dir, [
      'gen/a.ts',
      'gen/keep.ts',
      'gen/clear.ts',
      'x/app.min.js',
      'docs/a.md',
      'src/a.ts',
    ])
    expect(Object.fromEntries(out)).toEqual({
      'gen/a.ts': { generated: true },
      'gen/keep.ts': { generated: false },
      'x/app.min.js': { vendored: true },
    })
  })

  test('matches each pattern as git does, as `git check-attr` shows', () => {
    const r = testRepo()
    r.write({
      '.gitattributes': [
        'vendor linguist-vendored',
        'third/ linguist-vendored',
        '/root.js linguist-generated',
        'docs/** linguist-documentation',
        '*.min.js linguist-generated',
        'a/b/*.ts linguist-generated',
        '!neg.ts linguist-generated',
        '{x,y}.ts linguist-generated',
        '.hidden* linguist-vendored',
        '"quoted name.ts" linguist-generated',
        '[attr]gen linguist-generated',
        'gen/*.ts linguist-generated=true linguist-vendored=false',
        'sub/** linguist-generated',
        '',
      ].join('\n'),
      'sub/.gitattributes': [
        'off.ts -linguist-generated',
        'no.ts linguist-generated=false',
        'clear.ts !linguist-generated',
        '/anchored.ts linguist-documentation',
        'deep/*.ts linguist-vendored',
        '',
      ].join('\n'),
    })
    const paths = [
      'vendor',
      'vendor/x.js',
      'lib/vendor',
      'third/x.js',
      'root.js',
      'lib/root.js',
      'docs/a.md',
      'docs/deep/b.md',
      'lib/docs/c.md',
      'app.min.js',
      'lib/app.min.js',
      'a/b/c.ts',
      'a/b/c/d.ts',
      'x/a/b/c.ts',
      'neg.ts',
      'x.ts',
      '{x,y}.ts',
      '.hidden-file',
      'lib/.hidden2',
      'quoted name.ts',
      'gen/a.ts',
      'gen/deeper/a.ts',
      'sub/plain.ts',
      'sub/off.ts',
      'sub/no.ts',
      'sub/clear.ts',
      'sub/anchored.ts',
      'sub/x/anchored.ts',
      'sub/deep/a.ts',
      'sub/x/deep/a.ts',
    ]
    // info/attributes outranks every .gitattributes in the tree.
    r.write({
      '.git/info/attributes': 'sub/plain.ts -linguist-generated\nlater.txt linguist-generated\n',
    })
    paths.push('later.txt')
    const git = checkAttr(r.open(), paths, null)
    expect(Object.fromEntries(readLinguistAttributes(r.dir, paths))).toEqual(
      Object.fromEntries(git),
    )
    // The patterns above did match something: git and the reader agree on more than nothing.
    expect(git.size).toBeGreaterThan(15)
  })

  test('expands [attr] macros from the top .gitattributes and info/attributes, as `git check-attr` does', () => {
    const r = testRepo()
    r.write({ ...MACRO_CASE.files, '.git/info/attributes': MACRO_CASE.info })
    const paths = [...MACRO_CASE.paths]
    const git = checkAttr(r.open(), paths, null)
    expect(Object.fromEntries(readLinguistAttributes(r.dir, paths))).toEqual(
      Object.fromEntries(git),
    )
    expect(git.get('dist/a.js')).toEqual({ generated: true })
    expect(git.size).toBeGreaterThan(8)
  })
})

test('readFiles: text, binary, too large, a symlink as its target, and missing', () => {
  const dir = folder({
    'a.txt': 'hi\n',
    'b.bin': Buffer.from([1, 0, 2]),
    'big.txt': 'x'.repeat(20),
  })
  symlinkSync('a.txt', join(dir, 'link'))
  const out = readFiles(dir, ['a.txt', 'b.bin', 'big.txt', 'link', 'gone'], 10)
  expect(Object.fromEntries(out)).toEqual({
    'a.txt': { kind: 'text', text: 'hi\n' },
    'b.bin': { kind: 'binary', bytes: 3 },
    'big.txt': { kind: 'too-large', bytes: 20 },
    link: { kind: 'text', text: 'a.txt' },
    gone: { kind: 'missing' },
  })
})

describe('countDirectory', () => {
  const sample = () =>
    folder({
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.gitignore': 'build/\n',
      '.gitattributes': 'pkg/gen/** linguist-generated\n',
      'pkg/src/a.ts': '// a\nimport b from "b"\n\nexport const a = b + 1\n',
      'pkg/gen/types.ts': 'export type T = 1\n',
      'pkg/build/out.js': 'x()\n',
      'pkg/README.md': '# Pkg\n',
    })

  test('counts a directory the way counting from the repository top would', () => {
    const dir = sample()
    const report = countDirectory({ dir: join(dir, 'pkg') })
    expect(countReportSchema.parse(report)).toEqual(report)
    expect(report.source).toEqual({ label: 'files on disk', commit: null })
    expect(report.files).toBe(3)
    expect(report.kinds).toEqual({ logic: 1, boilerplate: 1, comment: 1, doc: 1, blank: 1 })
    expect(report.groups.generated.files).toBe(1)
    expect(countDirectory({ dir: join(dir, 'pkg'), linguist: false }).groups.generated.files).toBe(
      0,
    )
  })

  test('paths are relative to the directory, and one with nothing under it is noted', () => {
    const dir = sample()
    const report = countDirectory({
      dir: join(dir, 'pkg'),
      paths: ['src', 'nowhere'],
      detail: true,
    })
    expect(report.paths).toEqual(['src', 'nowhere'])
    expect(report.fileList?.map((f) => f.path)).toEqual(['src/a.ts'])
    expect(report.notes).toContain('no files under nowhere')
    expect(() => countDirectory({ dir: join(dir, 'pkg'), paths: ['../x'] })).toThrow(CodeStatsError)
    expect(() => countDirectory({ dir: join(dir, 'missing') })).toThrow('no such directory')
  })
})
