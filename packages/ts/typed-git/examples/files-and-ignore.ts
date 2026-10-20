// List tracked and untracked files, read a tree, and ask which paths are ignored.
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { makeGitFixture } from '@osdlc/typed-git/testing'

export function run(): void {
  const fx = makeGitFixture()
  try {
    const git = fx.git
    fx.commit('first', { 'src/a.ts': 'a\n', 'docs/b.md': 'bb\n', '.gitignore': 'build/\n' })
    mkdirSync(join(fx.dir, 'build'))
    writeFileSync(join(fx.dir, 'build', 'out.txt'), 'out\n')
    writeFileSync(join(fx.dir, 'notes.txt'), 'notes\n')

    assert.deepEqual(git.lsFiles(), ['.gitignore', 'docs/b.md', 'src/a.ts'])
    assert.deepEqual(git.lsFiles({ others: true, excludeStandard: true }), ['notes.txt'])
    assert.deepEqual(git.lsFiles({ others: true }), ['build/out.txt', 'notes.txt'])

    assert.deepEqual(
      git.lsTree('HEAD').map((e) => `${e.type} ${e.path}`),
      ['blob .gitignore', 'tree docs', 'tree src'],
    )
    assert.deepEqual(
      git.lsTree('HEAD', { recursive: true, long: true }).map((e) => [e.path, e.sizeBytes]),
      [
        ['.gitignore', 7],
        ['docs/b.md', 3],
        ['src/a.ts', 2],
      ],
    )

    git.rawChecked(['update-index', '--assume-unchanged', 'src/a.ts'])
    assert.deepEqual(
      git.lsFilesTagged().find((f) => f.path === 'src/a.ts'),
      {
        tag: 'h',
        path: 'src/a.ts',
      },
    )

    assert.deepEqual(git.checkIgnore(['build/out.txt', 'notes.txt']), new Set(['build/out.txt']))
    assert.deepEqual(git.checkIgnore(['notes.txt']), new Set())
    assert.deepEqual(git.checkIgnoreVerbose(['build/out.txt']), [
      { path: 'build/out.txt', source: '.gitignore', line: 1, pattern: 'build/' },
    ])
  } finally {
    fx.cleanup()
  }
}
