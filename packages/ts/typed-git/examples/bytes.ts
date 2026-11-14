// Read output byte for byte: a blob that is not UTF-8, ignored files, and a binary patch that replays.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { makeGitFixture } from '@osdlc/typed-git/testing'

export function run(): void {
  const fx = makeGitFixture()
  try {
    const git = fx.git
    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe])
    writeFileSync(join(fx.dir, 'logo.png'), image)
    fx.commit('first', { '.gitignore': 'dist/\n' })

    // `rawBytes` keeps stdout as the bytes git wrote, so a hash of it is the hash of the blob.
    const blob = git.rawBytesChecked(['cat-file', 'blob', 'HEAD:logo.png']).stdout
    assert.equal(
      createHash('sha256').update(blob).digest('hex'),
      createHash('sha256').update(image).digest('hex'),
    )

    // Ignored files, one entry each, as `!` entries.
    mkdirSync(join(fx.dir, 'dist'))
    writeFileSync(join(fx.dir, 'dist', 'app.js'), 'built\n')
    assert.deepEqual(git.statusEntries(), [])
    assert.deepEqual(git.statusEntries({ ignored: true }), [
      { x: '!', y: '!', path: 'dist/app.js' },
    ])

    // A binary change as a patch that `git apply` replays.
    const edited = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01, 0xff])
    writeFileSync(join(fx.dir, 'logo.png'), edited)
    const patch = git.diffText(undefined, { binary: true, paths: ['logo.png'] })
    assert.match(patch, /GIT binary patch/)
    git.rawChecked(['checkout', '--', 'logo.png'])
    git.rawChecked(['apply'], { input: patch })
    assert.deepEqual(readFileSync(join(fx.dir, 'logo.png')), edited)
  } finally {
    fx.cleanup()
  }
}
