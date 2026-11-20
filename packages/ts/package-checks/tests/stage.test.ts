import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { test } from 'vitest'

import { githubRepository, readTarget, stage, trustArgs } from '@osdlc/package-checks'

import { prepareSteps, runSteps } from '../src/stage.ts'

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

test('stage reads each package folder from the root, not the working directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'stage-root-'))
  try {
    assert.throws(
      () => stage(['packages/ts/new-lib'], { root, dryRun: true }),
      (e: Error) => e.message === `${join(root, 'packages/ts/new-lib')}: no package.json`,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('preparing a package installs only when node_modules is missing, then builds its workspace dependencies', () => {
  const root = mkdtempSync(join(tmpdir(), 'stage-prepare-'))
  try {
    const needed = (steps: ReturnType<typeof prepareSteps>) =>
      steps.filter((s) => s.needed).map((s) => [s.command, ...s.argv].join(' '))
    assert.deepEqual(needed(prepareSteps('@osdlc/x', root)), [
      'pnpm install',
      'pnpm --filter @osdlc/x... --fail-if-no-match run --if-present build',
    ])
    mkdirSync(join(root, 'node_modules'))
    assert.equal(needed(prepareSteps('@osdlc/x', root, join(root, 'new-lib'))).length, 2)
    assert.deepEqual(needed(prepareSteps('@osdlc/x', root)), [
      'pnpm --filter @osdlc/x... --fail-if-no-match run --if-present build',
    ])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the first failing step is named and later steps do not run', () => {
  const step = (label: string, needed = true) => ({
    label,
    command: label,
    argv: [],
    cwd: '.',
    needed,
  })
  const ran: string[] = []
  const run = (command: string) => {
    ran.push(command)
    return command === 'two' ? 1 : 0
  }
  assert.equal(
    runSteps([step('one'), step('skipped', false), step('two'), step('three')], run),
    'two',
  )
  assert.deepEqual(ran, ['one', 'two'])
  assert.equal(
    runSteps([step('one')], () => 0),
    null,
  )
})
