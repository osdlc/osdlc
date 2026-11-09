import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { test } from 'vitest'

import { githubRepository, readTarget, trustArgs } from '@osdlc/package-checks'

test('the GitHub repository comes from any form of repository.url', () => {
  for (const url of [
    'git+https://github.com/osdlc/markdown.git',
    'https://github.com/osdlc/markdown',
    'git@github.com:osdlc/markdown.git',
    'ssh://git@github.com/osdlc/markdown.git',
    'git://github.com/osdlc/markdown.git',
    'github:osdlc/markdown',
    'osdlc/markdown',
  ]) {
    assert.equal(githubRepository(url), 'osdlc/markdown', url)
  }
  assert.equal(githubRepository('https://gitlab.com/osdlc/markdown.git'), null)
})

test('a target is public, in its scope, licensed, and on GitHub', () => {
  const dir = mkdtempSync(join(tmpdir(), 'package-checks-stage-'))
  const write = (pkg: object) => writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg))
  try {
    mkdirSync(dir, { recursive: true })
    const good = {
      name: '@osdlc/x',
      license: 'MIT',
      repository: { type: 'git', url: 'git+https://github.com/osdlc/markdown.git' },
    }
    write(good)
    assert.deepEqual(readTarget(dir), { dir, name: '@osdlc/x', repository: 'osdlc/markdown' })
    write({ ...good, name: '@acme/x' })
    assert.throws(() => readTarget(dir), /not in the @osdlc scope/)
    assert.equal(readTarget(dir, null).name, '@acme/x')
    write({ ...good, private: true })
    assert.throws(() => readTarget(dir), /private/)
    write({ ...good, repository: 'https://example.com/x.git' })
    assert.throws(() => readTarget(dir), /does not name a GitHub repository/)
    write({ ...good, license: undefined })
    assert.throws(() => readTarget(dir), /no license/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the trusted publisher names the package repository, the workflow and the environment', () => {
  const target = { dir: '.', name: '@osdlc/x', repository: 'osdlc/markdown' }
  assert.deepEqual(trustArgs(target, 'packages-publish.yml', undefined), [
    'trust',
    'github',
    '--file',
    'packages-publish.yml',
    '--repository',
    'osdlc/markdown',
    '--allow-publish',
  ])
  assert.deepEqual(trustArgs(target, 'p.yml', 'npm').slice(5, 8), [
    'osdlc/markdown',
    '--environment',
    'npm',
  ])
})
