// Parse repository references and find checkouts on disk. No git process runs.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  checkoutRoot,
  discoverCheckouts,
  gitSshUrl,
  parseGitUrl,
  parseRemoteRepo,
  parseRepoRef,
} from '@osdlc/typed-git'
import { makeGitFixture } from '@osdlc/typed-git/testing'

export function run(): void {
  assert.deepEqual(parseGitUrl('github:acme/widgets#v1'), {
    type: 'github',
    domain: 'github.com',
    user: 'acme',
    project: 'widgets',
    committish: 'v1',
  })
  assert.equal(parseGitUrl('https://example.invalid/acme/widgets'), null)
  assert.equal(gitSshUrl('acme/widgets'), 'git@github.com:acme/widgets.git')

  // A pasted pull request URL still names the repository.
  assert.deepEqual(parseRepoRef('https://github.com/acme/widgets/pull/12'), {
    host: 'github.com',
    owner: 'acme',
    repo: 'widgets',
    cloneUrl: 'https://github.com/acme/widgets.git',
    committish: null,
  })
  // Shorthand takes the protocol argument. A null result means the input names no repository.
  assert.equal(parseRepoRef('acme/widgets', 'ssh')?.cloneUrl, 'git@github.com:acme/widgets.git')
  assert.equal(parseRepoRef('./a/local/path'), null)

  // A remote on any host, known or not, reads into host, owner and repo.
  assert.deepEqual(parseRemoteRepo('git@forge.example.com:team/app.git'), {
    host: 'forge.example.com',
    owner: 'team',
    repo: 'app',
  })

  const root = mkdtempSync(join(tmpdir(), 'typed-git-refs-'))
  const fx = makeGitFixture({ dir: join(root, 'acme', 'widgets') })
  try {
    // `checkoutRoot` walks up to the nearest `.git`. The path need not exist.
    assert.equal(checkoutRoot(join(fx.dir, 'src', 'index.ts')), fx.dir)

    // `discoverCheckouts` walks down. `maxDepth` counts levels below the search root.
    assert.deepEqual(discoverCheckouts(root), [fx.dir])
    assert.deepEqual(discoverCheckouts(root, { maxDepth: 1 }), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
