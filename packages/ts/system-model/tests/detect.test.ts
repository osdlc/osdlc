import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { afterAll, describe, expect, test } from 'vitest'

import { builtins } from '../src/builtins.ts'
import { createProject } from '../src/project.ts'
import type { Package, ProjectProfile } from '../src/tool.ts'
import { fakeRunners, fakeWhich, fixtureRoot, moonProjectsJson, removeRoot } from './support.ts'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

async function root(files: Record<string, string>): Promise<string> {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return dir
}

const project = createProject({ tools: builtins })

function detect(dir: string, extra: Record<string, unknown> = {}): Promise<ProjectProfile> {
  return project.detect(dir, {
    discovery: 'walk',
    makeRunner: fakeRunners([]).make,
    which: fakeWhich({}),
    ...extra,
  })
}

function pkg(profile: ProjectProfile, dir: string): Package {
  const found = profile.packages.find((p) => p.dir === dir)
  if (found === undefined) throw new Error(`no package for ${dir}`)
  return found
}

function toolIds(p: Package): string[] {
  return p.tools.map((t) => t.tool)
}

describe('detect', () => {
  test('records how it was configured, because that changes the results', async () => {
    const dir = await root({ 'package.json': '{}' })
    const profile = await detect(dir, { excludePaths: ['fixtures'] })
    expect(profile.root).toBe(dir)
    expect(Date.parse(profile.generatedAt)).not.toBeNaN()
    expect(profile.discovery).toBe('walk')
    expect(profile.allowExec).toBe(false)
    expect(profile.excludePaths).toEqual(['fixtures'])
  })

  test('the root is always a package, even with nothing in it', async () => {
    const dir = await root({ 'README.md': 'hi' })
    const profile = await detect(dir)
    expect(profile.packages).toEqual([
      { dir: '.', ecosystems: [], languages: [], manifests: {}, manifestFiles: [], tools: [] },
    ])
    expect(profile.ecosystems).toEqual([])
    expect(profile.tools).toEqual([])
    expect(profile.malformed).toEqual([])
  })

  test('packages are sorted by directory, root first', async () => {
    const dir = await root({
      'Cargo.toml': '[package]\nname = "root"\n',
      'crates/b/Cargo.toml': '[package]\nname = "b"\n',
      'crates/a/Cargo.toml': '[package]\nname = "a"\n',
    })
    const profile = await detect(dir)
    expect(profile.packages.map((p) => p.dir)).toEqual(['.', 'crates/a', 'crates/b'])
  })

  test('a lockfile alone makes a package', async () => {
    const dir = await root({ 'sub/pnpm-lock.yaml': '' })
    const profile = await detect(dir)
    expect(profile.packages.map((p) => p.dir)).toEqual(['.', 'sub'])
    expect(toolIds(pkg(profile, 'sub'))).toEqual(['pnpm'])
    expect(pkg(profile, 'sub').ecosystems).toEqual(['node'])
  })

  test('a marker that is not a manifest or lockfile attaches to the nearest package above', async () => {
    const dir = await root({
      'packages/api/package.json': '{}',
      'packages/api/src/justfile': 'build:\n    echo\n',
      'docs/Makefile': 'all:\n\techo\n',
    })
    const profile = await detect(dir)
    expect(profile.packages.map((p) => p.dir)).toEqual(['.', 'packages/api'])
    expect(toolIds(pkg(profile, 'packages/api'))).toContain('just')
    expect(toolIds(pkg(profile, '.'))).toEqual(['make'])
  })

  describe('cargo', () => {
    test('a plain crate is not a workspace', async () => {
      const dir = await root({ 'Cargo.toml': '[package]\nname = "demo"\n' })
      const profile = await detect(dir)
      expect(pkg(profile, '.').manifests.cargo).toEqual({
        manifestPath: 'Cargo.toml',
        workspace: false,
        name: 'demo',
      })
    })

    test('a `[workspace]` table is detected', async () => {
      const dir = await root({ 'Cargo.toml': '[workspace]\nmembers = ["crates/*"]\n' })
      const profile = await detect(dir)
      expect(pkg(profile, '.').manifests.cargo).toEqual({
        manifestPath: 'Cargo.toml',
        workspace: true,
        workspaceMembers: ['crates/*'],
      })
    })

    test('a nested crate gets its own package', async () => {
      const dir = await root({ 'crates/mine/Cargo.toml': '[package]\nname = "mine"\n' })
      const profile = await detect(dir)
      expect(pkg(profile, 'crates/mine').manifests.cargo?.manifestPath).toBe(
        'crates/mine/Cargo.toml',
      )
      expect(pkg(profile, 'crates/mine').manifestFiles).toEqual(['crates/mine/Cargo.toml'])
    })

    test('carries manifest evidence on the cargo tool', async () => {
      const dir = await root({ 'Cargo.toml': '[package]\nname = "demo"\n' })
      const profile = await detect(dir)
      const cargo = pkg(profile, '.').tools.find((t) => t.tool === 'cargo')
      expect(cargo).toEqual({
        tool: 'cargo',
        ecosystem: 'rust',
        roles: ['packageManager', 'runner'],
        evidence: [{ kind: 'manifest', tier: 1, source: 'Cargo.toml', found: 'Cargo.toml' }],
      })
    })
  })

  describe('package.json', () => {
    test('scripts, dependencies and identity fields', async () => {
      const dir = await root({
        'package.json': JSON.stringify({
          name: 'demo',
          main: 'index.js',
          types: 'index.d.ts',
          scripts: { build: 'tsc', broken: 123 },
          dependencies: { vue: '^3.0.0' },
          devDependencies: { vitest: '^3.0.0' },
        }),
      })
      const profile = await detect(dir)
      expect(pkg(profile, '.').manifests.packageJson).toEqual({
        manifestPath: 'package.json',
        name: 'demo',
        main: 'index.js',
        types: 'index.d.ts',
        scripts: { build: 'tsc' },
        dependencies: ['vitest', 'vue'],
        deps: [
          { name: 'vue', kind: 'prod', specifier: '^3.0.0', specifierKind: 'registry' },
          { name: 'vitest', kind: 'dev', specifier: '^3.0.0', specifierKind: 'registry' },
        ],
      })
    })

    test('an unparseable manifest goes to malformed, and its package still exists', async () => {
      const dir = await root({ 'package.json': '{ not json' })
      const profile = await detect(dir)
      expect(pkg(profile, '.').manifests.packageJson).toBeUndefined()
      expect(pkg(profile, '.').manifestFiles).toEqual(['package.json'])
      expect(pkg(profile, '.').ecosystems).toEqual(['node'])
      expect(profile.malformed).toEqual([
        { path: 'package.json', error: expect.stringContaining('parse failed:') },
      ])
    })

    test('a nested package gets its own package', async () => {
      const dir = await root({ 'packages/foo/package.json': JSON.stringify({ name: 'foo' }) })
      const profile = await detect(dir)
      expect(pkg(profile, 'packages/foo').manifests.packageJson?.name).toBe('foo')
    })
  })

  describe('package-manager tools', () => {
    test('a lockfile in the same directory detects the manager', async () => {
      const dir = await root({ 'package.json': '{}', 'bun.lock': '' })
      const profile = await detect(dir)
      expect(pkg(profile, '.').tools.find((t) => t.tool === 'bun')?.evidence).toEqual([
        { kind: 'files', tier: 3, source: 'bun.lock', found: 'bun.lock' },
      ])
    })

    test('a lockfile in a parent is not evidence on the nested package', async () => {
      const dir = await root({ 'bun.lock': '', 'packages/foo/package.json': '{}' })
      const profile = await detect(dir)
      expect(toolIds(pkg(profile, 'packages/foo'))).not.toContain('bun')
      expect(toolIds(pkg(profile, '.'))).toContain('bun')
    })

    test('a `packageManager` pin is evidence of its own, beside a lockfile it disagrees with', async () => {
      const dir = await root({
        'package.json': JSON.stringify({ packageManager: 'pnpm@9.1.0' }),
        'bun.lock': '',
      })
      const profile = await detect(dir)
      const root0 = pkg(profile, '.')
      expect(root0.tools.find((t) => t.tool === 'pnpm')?.evidence).toEqual([
        {
          kind: 'manifest',
          tier: 1,
          source: 'package.json#packageManager',
          found: 'pnpm@9.1.0',
        },
      ])
      expect(toolIds(root0)).toContain('bun')
    })

    test('both lockfiles are evidence when bun and pnpm are present', async () => {
      const dir = await root({ 'package.json': '{}', 'bun.lock': '', 'pnpm-lock.yaml': '' })
      const profile = await detect(dir)
      expect(toolIds(pkg(profile, '.'))).toEqual(expect.arrayContaining(['bun', 'pnpm']))
    })
  })

  describe('packageManagerPin', () => {
    test('recorded on the packageJson fact', async () => {
      const dir = await root({ 'package.json': JSON.stringify({ packageManager: 'yarn@4.1.0' }) })
      const profile = await detect(dir)
      expect(pkg(profile, '.').manifests.packageJson?.packageManagerPin).toEqual({
        manager: 'yarn',
        version: '4.1.0',
      })
    })

    test('absent when the field is absent', async () => {
      const dir = await root({ 'package.json': JSON.stringify({ name: 'x' }) })
      const profile = await detect(dir)
      expect(pkg(profile, '.').manifests.packageJson?.packageManagerPin).toBeUndefined()
    })

    test('recorded even with no lockfile anywhere', async () => {
      const dir = await root({
        'packages/leaf/package.json': JSON.stringify({ packageManager: 'pnpm@9.1.0' }),
      })
      const profile = await detect(dir)
      const leaf = pkg(profile, 'packages/leaf')
      expect(leaf.manifests.packageJson?.packageManagerPin).toEqual({
        manager: 'pnpm',
        version: '9.1.0',
      })
      expect(leaf.tools.find((t) => t.tool === 'pnpm')?.evidence.map((e) => e.kind)).toEqual([
        'manifest',
      ])
    })
  })

  describe('justfile and makefile', () => {
    test('justfiles found at the root and nested', async () => {
      const dir = await root({
        justfile: 'build:\n    echo\n',
        'packages/api/package.json': '{}',
        'packages/api/justfile': 'run:\n    echo\n',
      })
      const profile = await detect(dir)
      const source = (dir: string) =>
        pkg(profile, dir)
          .tools.find((t) => t.tool === 'just')
          ?.evidence.map((e) => e.source)
      expect(source('.')).toEqual(['justfile'])
      expect(source('packages/api')).toEqual(['packages/api/justfile'])
    })

    test('makefiles found at the root and nested', async () => {
      const dir = await root({
        Makefile: 'build:\n\techo\n',
        'packages/api/package.json': '{}',
        'packages/api/GNUmakefile': 'run:\n\techo\n',
      })
      const profile = await detect(dir)
      const source = (dir: string) =>
        pkg(profile, dir)
          .tools.find((t) => t.tool === 'make')
          ?.evidence.map((e) => e.source)
      expect(source('.')).toEqual(['Makefile'])
      expect(source('packages/api')).toEqual(['packages/api/GNUmakefile'])
    })
  })

  describe('mise', () => {
    test('a root config is evidence', async () => {
      const dir = await root({ 'mise.toml': '[tasks.build]\nrun = "echo"\n' })
      const profile = await detect(dir)
      expect(pkg(profile, '.').tools.find((t) => t.tool === 'mise')?.evidence).toEqual([
        { kind: 'files', tier: 3, source: 'mise.toml', found: '/mise.toml' },
      ])
    })

    test('a nested config is not, matching the mise runner’s root-only scope', async () => {
      const dir = await root({ 'packages/api/mise.toml': '[tasks.build]\nrun = "echo"\n' })
      const profile = await detect(dir)
      expect(profile.tools).not.toContain('mise')
    })
  })

  describe('hook managers', () => {
    test('lefthook', async () => {
      const dir = await root({ 'lefthook.yml': 'pre-commit:\n  commands: {}\n' })
      const profile = await detect(dir)
      expect(project.hookManagers(profile).map((d) => d.tool)).toEqual(['lefthook'])
    })

    test('husky', async () => {
      const dir = await root({ '.husky/pre-commit': 'npx lint-staged\n' })
      const profile = await detect(dir)
      expect(project.hookManagers(profile).map((d) => d.tool)).toEqual(['husky'])
    })

    test('pre-commit', async () => {
      const dir = await root({ '.pre-commit-config.yaml': 'repos: []\n' })
      const profile = await detect(dir)
      expect(project.hookManagers(profile).map((d) => d.tool)).toEqual(['pre-commit'])
    })

    test('only ever on the root package', async () => {
      const dir = await root({
        'lefthook.yml': 'pre-commit:\n  commands: {}\n',
        'packages/api/package.json': '{}',
      })
      const profile = await detect(dir)
      expect(toolIds(pkg(profile, 'packages/api'))).not.toContain('lefthook')
      expect(toolIds(pkg(profile, '.'))).toContain('lefthook')
    })
  })

  describe('tool managers needing trust', () => {
    test('mise from .tool-versions', async () => {
      const dir = await root({ '.tool-versions': 'node 22\n' })
      const profile = await detect(dir)
      expect(project.trust(profile).map((a) => a.tool)).toEqual(['mise'])
    })

    test('direnv', async () => {
      const dir = await root({ '.envrc': 'use flake\n' })
      const profile = await detect(dir)
      expect(project.trust(profile).map((a) => a.tool)).toEqual(['direnv'])
    })

    test('both at once, in registration order', async () => {
      const dir = await root({ '.mise.toml': '', '.envrc': '' })
      const profile = await detect(dir)
      expect(project.trust(profile).map((a) => a.tool)).toEqual(['mise', 'direnv'])
    })
  })

  describe('moon', () => {
    test('detected from the workspace marker, but not described without allowExec', async () => {
      const dir = await root({ '.moon/workspace.yml': 'projects: []\n' })
      const runners = fakeRunners([
        { binary: 'moon', argv: ['query', 'projects'], stdout: moonProjectsJson([]) },
      ])
      const profile = await detect(dir, { allowExec: false, makeRunner: runners.make })
      const moon = pkg(profile, '.').tools.find((t) => t.tool === 'moon')
      expect(moon?.facts).toBeUndefined()
      expect(runners.calls.filter((c) => c.binary === 'moon')).toEqual([])
    })

    test('not queried at all without the workspace marker, even with allowExec', async () => {
      const dir = await root({ 'package.json': '{}' })
      const runners = fakeRunners([
        { binary: 'moon', argv: ['query', 'projects'], stdout: moonProjectsJson([]) },
      ])
      await detect(dir, { allowExec: true, makeRunner: runners.make })
      expect(runners.calls.filter((c) => c.binary === 'moon')).toEqual([])
    })

    test('each project’s id and role, on its package, with allowExec on', async () => {
      const dir = await root({
        '.moon/workspace.yml': 'projects: []\n',
        'apps/web/package.json': '{}',
      })
      const runners = fakeRunners([
        {
          binary: 'moon',
          argv: ['query', 'projects'],
          stdout: moonProjectsJson([
            { id: 'root', source: '.', layer: 'tool' },
            {
              id: 'web',
              source: 'apps/web',
              layer: 'application',
              stack: 'frontend',
              language: 'typescript',
            },
          ]),
        },
      ])
      const profile = await detect(dir, { allowExec: true, makeRunner: runners.make })
      const facts = (dir: string) =>
        pkg(profile, dir)
          .tools.find((t) => t.tool === 'moon')
          ?.facts?.map((f) => f.fact)
      expect(facts('.')).toEqual([{ id: 'root', layer: 'tool' }])
      expect(facts('apps/web')).toEqual([
        { id: 'web', layer: 'application', stack: 'frontend', language: 'typescript' },
      ])
      expect(
        pkg(profile, 'apps/web').tools.find((t) => t.tool === 'moon')?.evidence,
      ).toContainEqual({
        kind: 'content',
        tier: 4,
        source: 'apps/web/moon.yml',
        found: 'moon query projects',
      })
    })

    test('a moon project with no package of its own attaches to the nearest package', async () => {
      const dir = await root({ '.moon/workspace.yml': 'projects: []\n' })
      const runners = fakeRunners([
        {
          binary: 'moon',
          argv: ['query', 'projects'],
          stdout: moonProjectsJson([{ id: 'app', source: 'apps/bare' }]),
        },
      ])
      const profile = await detect(dir, { allowExec: true, makeRunner: runners.make })
      expect(profile.packages.map((p) => p.dir)).toEqual(['.'])
      expect(pkg(profile, '.').tools.find((t) => t.tool === 'moon')?.facts).toEqual([
        {
          dir: 'apps/bare',
          fact: { id: 'app' },
          evidence: {
            kind: 'content',
            tier: 4,
            source: 'apps/bare/moon.yml',
            found: 'moon query projects',
          },
        },
      ])
    })

    test('a failed query yields no moon facts rather than throwing', async () => {
      const dir = await root({ '.moon/workspace.yml': 'projects: []\n' })
      const runners = fakeRunners([
        { binary: 'moon', argv: ['query', 'projects'], exitCode: 1, stderr: 'boom' },
      ])
      const profile = await detect(dir, { allowExec: true, makeRunner: runners.make })
      const moon = pkg(profile, '.').tools.find((t) => t.tool === 'moon')
      expect(moon).toBeDefined()
      expect(moon?.facts).toBeUndefined()
    })
  })

  describe('ecosystems and languages', () => {
    test('node is javascript without TypeScript', async () => {
      const dir = await root({ 'package.json': '{}' })
      const p = pkg(await detect(dir), '.')
      expect(p.ecosystems).toEqual(['node'])
      expect(p.languages).toEqual(['javascript'])
    })

    test('node is typescript with a tsconfig.json', async () => {
      const dir = await root({ 'package.json': '{}', 'tsconfig.json': '{}' })
      expect(pkg(await detect(dir), '.').languages).toEqual(['typescript'])
    })

    test('node is typescript with a typescript dependency', async () => {
      const dir = await root({
        'package.json': JSON.stringify({ devDependencies: { typescript: '^5.0.0' } }),
      })
      expect(pkg(await detect(dir), '.').languages).toEqual(['typescript'])
    })

    test('a tsconfig.json elsewhere does not make a package typescript', async () => {
      const dir = await root({ 'package.json': '{}', 'other/tsconfig.json': '{}' })
      expect(pkg(await detect(dir), '.').languages).toEqual(['javascript'])
    })

    test('an ecosystem comes from a detected tool as well as a manifest', async () => {
      const dir = await root({ 'bun.lock': '' })
      const p = pkg(await detect(dir), '.')
      expect(p.ecosystems).toEqual(['node'])
      expect(p.languages).toEqual(['javascript'])
    })

    test('jvm is scala when sbt is detected', async () => {
      const dir = await root({ 'build.sbt': 'name := "x"\n' })
      const p = pkg(await detect(dir), '.')
      expect(p.ecosystems).toEqual(['jvm'])
      expect(p.languages).toEqual(['scala'])
    })

    test('jvm is java otherwise', async () => {
      const dir = await root({ 'pom.xml': '<project/>' })
      const p = pkg(await detect(dir), '.')
      expect(p.ecosystems).toEqual(['jvm'])
      expect(p.languages).toEqual(['java'])
    })

    test('go, ruby and python', async () => {
      const dir = await root({
        'go/go.mod': 'module example.com/x\n\ngo 1.22\n\nrequire github.com/a/b v1.2.3\n',
        'rb/Gemfile': "gem 'rails', '7.1'\ngroup :test do\n  gem 'rspec'\nend\n",
        'py/pyproject.toml': '[project]\nname = "x"\ndependencies = ["requests>=2"]\n',
      })
      const profile = await detect(dir)
      expect(pkg(profile, 'go').ecosystems).toEqual(['go'])
      expect(pkg(profile, 'go').languages).toEqual(['go'])
      expect(pkg(profile, 'go').manifests.goMod).toEqual({
        manifestPath: 'go/go.mod',
        module: 'example.com/x',
        go: '1.22',
        deps: [
          {
            name: 'github.com/a/b',
            kind: 'prod',
            specifier: 'v1.2.3',
            specifierKind: 'registry',
          },
        ],
      })
      expect(pkg(profile, 'rb').languages).toEqual(['ruby'])
      expect(pkg(profile, 'rb').manifests.gemfile?.deps).toEqual([
        { name: 'rails', kind: 'prod', specifier: '7.1', specifierKind: 'registry' },
        { name: 'rspec', kind: 'dev', specifier: '', specifierKind: 'registry' },
      ])
      expect(pkg(profile, 'py').languages).toEqual(['python'])
      expect(pkg(profile, 'py').manifests.pyproject?.deps?.map((d) => d.name)).toEqual(['requests'])
      expect(profile.languages).toEqual(expect.arrayContaining(['go', 'ruby', 'python']))
    })

    test('a polyglot package carries every ecosystem in registry order', async () => {
      const dir = await root({ 'package.json': '{}', 'Cargo.toml': '[package]\nname = "x"\n' })
      const profile = await detect(dir)
      expect(pkg(profile, '.').ecosystems).toEqual(['node', 'rust'])
      expect(pkg(profile, '.').languages).toEqual(['javascript', 'rust'])
      expect(profile.ecosystems).toEqual(['node', 'rust'])
    })
  })
})

describe('findRoot', () => {
  test('a repository marker anywhere above beats a nearer package manifest', async () => {
    const dir = await root({ '.git/HEAD': '', 'packages/a/package.json': '{}' })
    await mkdir(join(dir, 'packages/a/src'), { recursive: true })
    expect(await project.findRoot(join(dir, 'packages/a/src'))).toBe(dir)
  })

  test('the nearest repository marker wins, so a nested checkout resolves to itself', async () => {
    const dir = await root({ '.git/HEAD': '', 'vendor/inner/.git/HEAD': '' })
    expect(await project.findRoot(join(dir, 'vendor/inner'))).toBe(join(dir, 'vendor/inner'))
  })

  test('moon’s workspace file marks a repository root', async () => {
    const dir = await root({ '.moon/workspace.yml': '', 'apps/web/package.json': '{}' })
    expect(await project.findRoot(join(dir, 'apps/web'))).toBe(dir)
  })

  test('with no repository marker, the nearest package manifest wins', async () => {
    const dir = await root({ 'package.json': '{}', 'packages/a/Cargo.toml': '' })
    await mkdir(join(dir, 'packages/a/src'), { recursive: true })
    expect(await project.findRoot(join(dir, 'packages/a/src'))).toBe(join(dir, 'packages/a'))
  })

  test('a lockfile is not a package marker for findRoot', async () => {
    const dir = await root({ 'package.json': '{}', 'sub/bun.lock': '' })
    expect(await project.findRoot(join(dir, 'sub'))).toBe(dir)
  })

  test('an unanchored tool marker counts as a package marker', async () => {
    const dir = await root({ 'tools/justfile': '' })
    expect(await project.findRoot(join(dir, 'tools'))).toBe(join(dir, 'tools'))
  })
})
