/**
 * Questions asked by role: which package manager, how to install, which tool
 * and hook managers, and what to run to set a fresh checkout up.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import {
  createProject,
  type PackageManagerChoice,
  type PinnedInstall,
  type PinnedInstallOptions,
  type PinnedSource,
  type ToolAction,
} from '@osdlc/system-model/detect'
import { builtins } from '@osdlc/system-model/builtins'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function repo(files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'project-example-')))
  roots.push(root)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

const project = createProject({ tools: builtins })

test('a workspace member installs through the root lockfile', async () => {
  const root = repo({
    'package.json': JSON.stringify({ packageManager: 'pnpm@9.1.0' }),
    'pnpm-lock.yaml': '',
    'pnpm-workspace.yaml': 'packages:\n  - apps/*\n',
    'apps/web/package.json': JSON.stringify({ name: 'web' }),
  })
  const profile = await project.detect(root, { discovery: 'walk' })

  const choices: PackageManagerChoice[] = project.packageManagers(profile, 'apps/web')
  expect(choices).toMatchObject([{ tool: 'pnpm', ecosystem: 'node', dir: '.', locked: true }])

  const install: ToolAction[] = project.install(profile, 'apps/web')
  expect(install.map((a) => [a.dir, a.argv])).toEqual([['.', ['pnpm', 'install']]])
  expect(project.frozenInstall(profile)[0]?.argv).toEqual(['pnpm', 'install', '--frozen-lockfile'])
  // No node_modules yet, so the install is still to do.
  expect(project.missingDeps(profile).map((a) => a.tool)).toEqual(['pnpm'])
})

test('a pinned manager is run at its pinned version', async () => {
  const root = repo({
    'package.json': JSON.stringify({ packageManager: 'pnpm@9.1.0' }),
    'pnpm-lock.yaml': '',
  })
  const profile = await project.detect(root, { discovery: 'walk' })
  const [install] = project.install(profile)

  // A fake PATH pnpm that reports the pinned version.
  const options: PinnedInstallOptions = {
    allowExec: false,
    runnerFor: () => ({ run: () => ({ exitCode: 0, stdout: '9.1.0\n', stderr: '' }) }),
  }
  const pinned: PinnedInstall | null = project.pinnedInstall(profile, install!, options)
  const source: PinnedSource | undefined = pinned?.source
  expect(source).toBe('path')
  expect(pinned?.argv).toEqual(['pnpm', 'install', '--frozen-lockfile'])
  expect(pinned?.versionMismatch).toBe(false)
})

test('tool managers, trust grants and git hooks', async () => {
  const root = repo({
    'mise.toml': '[tools]\nnode = "22"\n',
    '.envrc': 'use mise\n',
    'lefthook.yml':
      'pre-commit:\n  commands:\n    lint:\n      run: pnpm lint\npre-push:\n  commands: {}\n',
  })
  const profile = await project.detect(root, { discovery: 'walk' })

  expect(project.toolManagers(profile).map((t) => t.tool)).toEqual(['mise', 'direnv'])
  expect(project.execPrefix(profile, 'node')).toEqual(['mise', 'exec', '--', 'node'])
  expect(project.trust(profile).map((a) => a.argv)).toEqual([
    ['mise', 'trust'],
    ['direnv', 'allow'],
  ])
  expect(project.hookManagers(profile).map((t) => t.tool)).toEqual(['lefthook'])
  expect(project.armHooks(profile).map((a) => a.argv)).toEqual([['lefthook', 'install']])

  // Each hook is also a task, so it can be run by hand.
  const catalog = await project.runners.collect(profile)
  const hooks = catalog.reports.find((r) => r.runner === 'hook-manager')!.tasks
  expect(hooks.map((t) => t.display)).toEqual([
    'lefthook install',
    'lefthook run pre-commit',
    'lefthook run pre-push',
  ])
})
