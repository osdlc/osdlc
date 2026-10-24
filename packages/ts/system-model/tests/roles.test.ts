import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { afterAll, describe, expect, test } from 'vitest'

import { builtins } from '../src/builtins.ts'
import type { Catalog, RunnerReport } from '../src/model.ts'
import { bun, npm, pnpm, yarn } from '../src/plugins/node/index.ts'
import { createProject } from '../src/project.ts'
import type { ProjectProfile } from '../src/tool.ts'
import { detectAndCollect, fakeRunners, fakeWhich, fixtureRoot, removeRoot } from './support.ts'

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

function detect(dir: string): Promise<ProjectProfile> {
  return project.detect(dir, {
    discovery: 'walk',
    makeRunner: fakeRunners([]).make,
    which: fakeWhich({}),
  })
}

/** A fixture of empty files. */
async function profileOf(files: string[]): Promise<ProjectProfile> {
  return detect(await root(Object.fromEntries(files.map((f) => [f, '']))))
}

async function commands(files: string[], dir = '.'): Promise<string[]> {
  return project.install(await profileOf(files), dir).map((a) => a.argv.join(' '))
}

async function frozen(files: string[], dir = '.'): Promise<string[]> {
  return project.frozenInstall(await profileOf(files), dir).map((a) => a.argv.join(' '))
}

function report(catalog: Catalog, runner: string): RunnerReport | undefined {
  return catalog.reports.find((r) => r.runner === runner)
}

function collectWalk(dir: string) {
  return detectAndCollect(dir, {
    discovery: 'walk',
    makeRunner: fakeRunners([]).make,
    which: fakeWhich({}),
  })
}

describe('packageManagers', () => {
  test('precedence is bun, pnpm, yarn, npm for a package holding several lockfiles', async () => {
    const profile = await profileOf([
      'package.json',
      'bun.lock',
      'pnpm-lock.yaml',
      'yarn.lock',
      'package-lock.json',
    ])
    expect(project.packageManagers(profile)).toEqual([
      {
        tool: 'bun',
        ecosystem: 'node',
        dir: '.',
        source: 'bun.lock',
        locked: true,
        fallback: false,
      },
    ])
  })

  test('walks up to the nearest lockfile', async () => {
    const profile = await detect(
      await root({
        'package.json': '{"workspaces":["packages/ts/*"]}',
        'bun.lock': '',
        'packages/ts/leaf/package.json': '{}',
      }),
    )
    expect(project.packageManagers(profile, 'packages/ts/leaf')).toEqual([
      {
        tool: 'bun',
        ecosystem: 'node',
        dir: '.',
        source: 'bun.lock',
        locked: true,
        fallback: false,
      },
    ])
  })

  test('the nearest lockfile wins over a farther one', async () => {
    const profile = await detect(
      await root({
        'package.json': '{"workspaces":["sub"]}',
        'bun.lock': '',
        'sub/package.json': '{"workspaces":["leaf"]}',
        'sub/yarn.lock': '',
        'sub/leaf/package.json': '{}',
      }),
    )
    const [choice] = project.packageManagers(profile, 'sub/leaf')
    expect(choice?.tool).toBe('yarn')
    expect(choice?.dir).toBe('sub')
  })

  test('a packageManager pin outranks a lockfile in the same package', async () => {
    const dir = await root({
      'package.json': JSON.stringify({ packageManager: 'pnpm@9.0.0' }),
      'package-lock.json': '',
    })
    const [choice] = project.packageManagers(await detect(dir))
    expect(choice).toEqual({
      tool: 'pnpm',
      ecosystem: 'node',
      dir: '.',
      source: 'package.json#packageManager',
      locked: false,
      fallback: false,
    })
  })

  test('a pin naming no registered manager chooses nothing', async () => {
    const dir = await root({ 'package.json': JSON.stringify({ packageManager: 'cargo@1.0.0' }) })
    const [choice] = project.packageManagers(await detect(dir))
    expect(choice?.tool).toBe('npm')
    expect(choice?.fallback).toBe(true)
  })

  test('a non-string or empty pin is ignored', async () => {
    for (const field of [42, '', 'bun', 'bun@']) {
      const dir = await root({ 'package.json': JSON.stringify({ packageManager: field }) })
      const profile = await detect(dir)
      expect(profile.packages[0]!.manifests.packageJson?.packageManagerPin).toBeUndefined()
      expect(project.packageManagers(profile)[0]?.fallback).toBe(true)
    }
  })

  test('stops at the root rather than escaping upward', async () => {
    const outer = await root({ 'bun.lock': '', 'r/leaf/package.json': '{}' })
    const profile = await detect(join(outer, 'r'))
    expect(project.packageManagers(profile, 'leaf')).toEqual([
      {
        tool: 'npm',
        ecosystem: 'node',
        dir: 'leaf',
        source: 'leaf/package.json',
        locked: false,
        fallback: true,
      },
    ])
  })

  test('falls back to npm when nothing chooses a node manager', async () => {
    const profile = await profileOf(['package.json'])
    expect(project.packageManagers(profile)).toEqual([
      {
        tool: 'npm',
        ecosystem: 'node',
        dir: '.',
        source: 'package.json',
        locked: false,
        fallback: true,
      },
    ])
  })

  test('one choice per ecosystem, never one manager for the whole package', async () => {
    const profile = await profileOf(['package.json', 'bun.lock', 'Cargo.toml'])
    expect(project.packageManagers(profile).map((c) => [c.ecosystem, c.tool])).toEqual([
      ['node', 'bun'],
      ['rust', 'cargo'],
    ])
  })

  test('a manifest that implies a manager defers to a workspace root that chose one', async () => {
    const profile = await detect(
      await root({
        'Cargo.toml': '[workspace]\nmembers = ["crates/*"]\n',
        'Cargo.lock': '',
        'crates/a/Cargo.toml': '[package]\nname = "a"\n',
      }),
    )
    expect(project.packageManagers(profile, 'crates/a')).toEqual([
      {
        tool: 'cargo',
        ecosystem: 'rust',
        dir: '.',
        source: 'Cargo.lock',
        locked: true,
        fallback: false,
      },
    ])
  })

  test('a manifest that implies a manager chooses at the package itself when nothing above did', async () => {
    const profile = await profileOf(['package.json', 'crates/a/Cargo.toml'])
    expect(project.packageManagers(profile, 'crates/a')).toEqual([
      {
        tool: 'cargo',
        ecosystem: 'rust',
        dir: 'crates/a',
        source: 'crates/a/Cargo.toml',
        locked: false,
        fallback: false,
      },
    ])
  })

  test('an unknown directory has no package managers', async () => {
    const profile = await profileOf(['package.json'])
    expect(project.packageManagers(profile, 'nowhere')).toEqual([])
  })
})

describe('install', () => {
  test('no markers → no installs', async () => {
    expect(await commands([])).toEqual([])
  })

  test('package.json + bun.lock → bun install', async () => {
    expect(await commands(['package.json', 'bun.lock'])).toEqual(['bun install'])
  })

  test('package.json + pnpm-lock.yaml → pnpm install', async () => {
    expect(await commands(['package.json', 'pnpm-lock.yaml'])).toEqual(['pnpm install'])
  })

  test('package.json + yarn.lock → yarn install', async () => {
    expect(await commands(['package.json', 'yarn.lock'])).toEqual(['yarn install'])
  })

  test('package.json + package-lock.json → npm ci', async () => {
    expect(await commands(['package.json', 'package-lock.json'])).toEqual(['npm ci'])
  })

  test('package.json alone → npm install', async () => {
    expect(await commands(['package.json'])).toEqual(['npm install'])
  })

  test('bun wins over pnpm and yarn when all their lockfiles are present', async () => {
    expect(await commands(['package.json', 'bun.lock', 'pnpm-lock.yaml', 'yarn.lock'])).toEqual([
      'bun install',
    ])
  })

  test('a bare lockfile with no package.json still chooses its manager', async () => {
    expect(await commands(['pnpm-lock.yaml'])).toEqual(['pnpm install'])
  })

  test('Cargo.toml → cargo fetch', async () => {
    expect(await commands(['Cargo.toml'])).toEqual(['cargo fetch'])
  })

  test('go.mod → go mod download', async () => {
    expect(await commands(['go.mod'])).toEqual(['go mod download'])
  })

  test('Gemfile → bundle install', async () => {
    expect(await commands(['Gemfile'])).toEqual(['bundle install'])
  })

  test('python precedence: uv.lock wins over requirements.txt', async () => {
    expect(await commands(['uv.lock', 'requirements.txt'])).toEqual(['uv sync'])
  })

  test('poetry.lock → poetry install', async () => {
    expect(await commands(['poetry.lock'])).toEqual(['poetry install'])
  })

  test('requirements.txt alone → pip install -r requirements.txt', async () => {
    expect(await commands(['requirements.txt'])).toEqual(['pip install -r requirements.txt'])
  })

  test('a pyproject.toml with no lockfile has no fallback manager', async () => {
    expect(await commands(['pyproject.toml'])).toEqual([])
  })

  test('every action carries tool, ecosystem, dir, argv and source', async () => {
    const profile = await profileOf(['package.json', 'bun.lock'])
    expect(project.install(profile)).toEqual([
      { tool: 'bun', ecosystem: 'node', dir: '.', argv: ['bun', 'install'], source: 'bun.lock' },
    ])
  })

  test('a workspace member installs at the workspace root', async () => {
    const profile = await detect(
      await root({
        'package.json': '{"workspaces":["packages/*"]}',
        'bun.lock': '',
        'packages/a/package.json': '{}',
      }),
    )
    expect(project.install(profile, 'packages/a')).toEqual([
      { tool: 'bun', ecosystem: 'node', dir: '.', argv: ['bun', 'install'], source: 'bun.lock' },
    ])
  })

  test('answers from the profile, never re-reading files', async () => {
    const dir = await root({ 'package.json': '{}', 'bun.lock': '', 'Cargo.toml': '' })
    const profile = await detect(dir)
    await rm(join(dir, 'package.json'))
    await rm(join(dir, 'bun.lock'))
    await rm(join(dir, 'Cargo.toml'))
    expect(project.install(profile).map((a) => a.argv.join(' '))).toEqual([
      'bun install',
      'cargo fetch',
    ])
  })
})

describe('frozenInstall', () => {
  test('node managers with a lockfile', async () => {
    expect(await frozen(['package.json', 'bun.lock'])).toEqual(['bun install --frozen-lockfile'])
    expect(await frozen(['package.json', 'pnpm-lock.yaml'])).toEqual([
      'pnpm install --frozen-lockfile',
    ])
    expect(await frozen(['package.json', 'yarn.lock'])).toEqual(['yarn install --frozen-lockfile'])
    expect(await frozen(['package.json', 'package-lock.json'])).toEqual(['npm ci'])
  })

  test('uv sync --locked and cargo fetch --locked', async () => {
    expect(await frozen(['uv.lock'])).toEqual(['uv sync --locked'])
    expect(await frozen(['Cargo.toml', 'Cargo.lock'])).toEqual(['cargo fetch --locked'])
  })

  test('skips a choice with no lockfile', async () => {
    expect(await frozen(['package.json'])).toEqual([])
    expect(await frozen(['Cargo.toml'])).toEqual([])
    const dir = await root({
      'package.json': JSON.stringify({ packageManager: 'pnpm@9.0.0' }),
      'bun.lock': '',
    })
    expect(project.frozenInstall(await detect(dir))).toEqual([])
  })

  test('skips managers with no frozen form', async () => {
    expect(await frozen(['poetry.lock'])).toEqual([])
    expect(await frozen(['requirements.txt'])).toEqual([])
    expect(await frozen(['go.mod', 'go.sum'])).toEqual([])
  })
})

describe('missingDeps', () => {
  test('bun.lock + package.json with no node_modules is missing; with node_modules it is not', async () => {
    const dir = await root({ 'package.json': '{}', 'bun.lock': '' })
    const profile = await detect(dir)
    expect(project.missingDeps(profile).map((a) => a.argv.join(' '))).toEqual(['bun install'])
    await mkdir(join(dir, 'node_modules'))
    expect(project.missingDeps(profile)).toEqual([])
  })

  test('a package.json with no lockfile never counts as missing', async () => {
    expect(project.missingDeps(await profileOf(['package.json']))).toEqual([])
  })

  test('yarn Plug’n’Play: .pnp.cjs counts as installed', async () => {
    expect(project.missingDeps(await profileOf(['package.json', 'yarn.lock', '.pnp.cjs']))).toEqual(
      [],
    )
  })

  test('uv.lock needs .venv', async () => {
    const dir = await root({ 'uv.lock': '' })
    const profile = await detect(dir)
    expect(project.missingDeps(profile).map((a) => a.argv.join(' '))).toEqual(['uv sync'])
    await mkdir(join(dir, '.venv'))
    expect(project.missingDeps(profile)).toEqual([])
  })

  test('ecosystems with no package-local deps directory never count', async () => {
    expect(
      project.missingDeps(await profileOf(['Cargo.toml', 'go.mod', 'Gemfile', 'requirements.txt'])),
    ).toEqual([])
  })

  test('an empty root is not missing anything', async () => {
    expect(project.missingDeps(await profileOf([]))).toEqual([])
  })

  test('a workspace member checks the deps directory of the workspace root', async () => {
    const dir = await root({
      'package.json': '{}',
      'bun.lock': '',
      'packages/a/package.json': '{}',
    })
    await mkdir(join(dir, 'node_modules'))
    expect(project.missingDeps(await detect(dir), 'packages/a')).toEqual([])
  })
})

describe('the node managers', () => {
  test('every lockfile a manager declares detects that manager', async () => {
    for (const tool of [bun, pnpm, yarn, npm]) {
      for (const lockfile of tool.roles.packageManager!.lockfiles) {
        const profile = await profileOf(['package.json', lockfile])
        expect(profile.packages[0]!.tools.map((t) => t.tool)).toContain(tool.id)
        expect(project.packageManagers(profile)[0]?.tool).toBe(tool.id)
      }
    }
  })

  test('every run verb is argv, not a string to be split later', () => {
    for (const tool of [bun, pnpm, yarn, npm]) {
      const run = tool.roles.packageManager!.run!
      expect(Array.isArray(run.verb)).toBe(true)
      expect(run.verb.length).toBeGreaterThan(0)
    }
  })
})

describe('toolForCommand', () => {
  test('reads the tool from a command’s first word', () => {
    expect(project.toolForCommand('pnpm run build')?.id).toBe('pnpm')
    expect(project.toolForCommand('cargo test')?.id).toBe('cargo')
    expect(project.toolForCommand('  uv run pytest')?.id).toBe('uv')
    expect(project.toolForCommand('just ci')?.id).toBe('just')
  })

  test('command words name their tool', () => {
    expect(project.toolForCommand('bunx vitest')?.id).toBe('bun')
    expect(project.toolForCommand('pip3 install x')?.id).toBe('pip')
    expect(project.toolForCommand('uvx ruff')?.id).toBe('uv')
    expect(project.toolForCommand('bundle exec rspec')?.id).toBe('bundler')
  })

  test('npx is not npm', () => {
    expect(project.toolForCommand('npx husky')).toBeUndefined()
  })

  test('unregistered words, blank and whitespace-only commands name nothing', () => {
    expect(project.toolForCommand('tsc --noEmit')).toBeUndefined()
    expect(project.toolForCommand('')).toBeUndefined()
    expect(project.toolForCommand('   ')).toBeUndefined()
  })

  test('every command word of every built-in resolves to its tool', () => {
    for (const tool of builtins) {
      for (const word of tool.commandWords ?? []) {
        expect(project.toolForCommand(`${word} x`)?.id).toBe(tool.id)
      }
    }
  })
})

describe('tool managers', () => {
  test('mise: exec prefix and trust', async () => {
    const profile = await profileOf(['mise.toml'])
    expect(project.toolManagers(profile).map((d) => d.tool)).toEqual(['mise'])
    expect(project.execPrefix(profile, 'node')).toEqual(['mise', 'exec', '--', 'node'])
    expect(project.trust(profile)).toEqual([
      { tool: 'mise', dir: '.', argv: ['mise', 'trust'], source: 'mise.toml' },
    ])
  })

  test('proto: exec prefix and no trust grant', async () => {
    const profile = await profileOf(['.prototools'])
    expect(project.execPrefix(profile, 'node')).toEqual(['proto', 'run', 'node', '--'])
    expect(project.trust(profile)).toEqual([])
  })

  test('proto comes before mise when both are detected', async () => {
    const profile = await profileOf(['.prototools', 'mise.toml'])
    expect(project.toolManagers(profile).map((d) => d.tool)).toEqual(['proto', 'mise'])
    expect(project.execPrefix(profile, 'bun')).toEqual(['proto', 'run', 'bun', '--'])
  })

  test('direnv: allow, and no exec prefix', async () => {
    const profile = await profileOf(['.envrc'])
    expect(project.trust(profile)).toEqual([
      { tool: 'direnv', dir: '.', argv: ['direnv', 'allow'], source: '.envrc' },
    ])
    expect(project.execPrefix(profile, 'node')).toEqual(['node'])
  })

  test('no tool manager: the binary runs as is', async () => {
    const profile = await profileOf(['package.json'])
    expect(project.toolManagers(profile)).toEqual([])
    expect(project.execPrefix(profile, 'node')).toEqual(['node'])
    expect(project.trust(profile)).toEqual([])
  })

  test('the tool-manager runner offers install and trust', async () => {
    const dir = await root({ 'mise.toml': '' })
    const { catalog } = await collectWalk(dir)
    const tasks = report(catalog, 'tool-manager')?.tasks ?? []
    expect(tasks.map((t) => [t.path.at(-1), t.argv.join(' ')])).toEqual([
      ['install', 'mise install'],
      ['trust', 'mise trust'],
    ])
    expect(tasks.every((t) => t.origin === 'synthesized')).toBe(true)
  })
})

describe('hook managers', () => {
  test('lefthook: each of its six config names', async () => {
    for (const name of [
      'lefthook.yml',
      'lefthook.yaml',
      '.lefthook.yml',
      '.lefthook.yaml',
      'lefthook.json',
      'lefthook.toml',
    ]) {
      const profile = await profileOf([name])
      expect(project.hookManagers(profile).map((d) => d.tool)).toEqual(['lefthook'])
      expect(project.armHooks(profile)).toEqual([
        { tool: 'lefthook', dir: '.', argv: ['lefthook', 'install'], source: name },
      ])
    }
  })

  test('lefthook in a nested directory is not detected', async () => {
    expect(project.hookManagers(await profileOf(['sub/lefthook.yml']))).toEqual([])
  })

  test('husky 9 or later arms with `npx husky`', async () => {
    const dir = await root({
      '.husky/pre-commit': '',
      'package.json': JSON.stringify({ devDependencies: { husky: '^9.0.11' } }),
    })
    expect(project.armHooks(await detect(dir)).map((a) => a.argv)).toEqual([['npx', 'husky']])
  })

  test('husky before 9 arms with `npx husky install`', async () => {
    const dir = await root({
      '.husky/pre-commit': '',
      'package.json': JSON.stringify({ devDependencies: { husky: '^8.0.3' } }),
    })
    expect(project.armHooks(await detect(dir)).map((a) => a.argv)).toEqual([
      ['npx', 'husky', 'install'],
    ])
  })

  test('husky with no specifier arms with `npx husky`', async () => {
    const profile = await profileOf(['.husky/pre-commit'])
    expect(project.armHooks(profile)).toEqual([
      { tool: 'husky', dir: '.', argv: ['npx', 'husky'], source: '.husky' },
    ])
  })

  test('pre-commit arms with `pre-commit install`', async () => {
    const profile = await profileOf(['.pre-commit-config.yaml'])
    expect(project.armHooks(profile)).toEqual([
      {
        tool: 'pre-commit',
        dir: '.',
        argv: ['pre-commit', 'install'],
        source: '.pre-commit-config.yaml',
      },
    ])
  })

  describe('the hook-manager runner', () => {
    function hookTasks(catalog: Catalog): Array<[string | undefined, string]> {
      return (report(catalog, 'hook-manager')?.tasks ?? []).map((t) => [
        t.path.at(-1),
        t.argv.join(' '),
      ])
    }

    test('lefthook yaml: arm, then each git hook it declares', async () => {
      const dir = await root({
        'lefthook.yml':
          'pre-commit:\n  commands:\n    lint:\n      run: eslint\npre-push:\n  commands: {}\nnot-a-hook:\n  x: 1\n',
      })
      const { catalog } = await collectWalk(dir)
      expect(hookTasks(catalog)).toEqual([
        ['arm', 'lefthook install'],
        ['pre-commit', 'lefthook run pre-commit'],
        ['pre-push', 'lefthook run pre-push'],
      ])
      const hook = report(catalog, 'hook-manager')!.tasks[1]!
      expect(hook.tags).toEqual(['hook-manager', 'lefthook', 'git-hook'])
      expect(hook.source).toBe('lefthook.yml')
    })

    test('lefthook json and toml', async () => {
      const json = await root({ 'lefthook.json': JSON.stringify({ 'commit-msg': {} }) })
      expect(hookTasks((await collectWalk(json)).catalog)).toEqual([
        ['arm', 'lefthook install'],
        ['commit-msg', 'lefthook run commit-msg'],
      ])
      const toml = await root({ 'lefthook.toml': '[pre-commit.commands.lint]\nrun = "x"\n' })
      expect(hookTasks((await collectWalk(toml)).catalog)).toEqual([
        ['arm', 'lefthook install'],
        ['pre-commit', 'lefthook run pre-commit'],
      ])
    })

    test('husky: each hook script directly under .husky/', async () => {
      const dir = await root({
        '.husky/pre-commit': 'npx lint-staged\n',
        '.husky/commit-msg': 'x\n',
        '.husky/_/husky.sh': '',
        '.husky/README': '',
      })
      const { catalog } = await collectWalk(dir)
      expect(hookTasks(catalog)).toEqual([
        ['arm', 'npx husky'],
        ['commit-msg', 'sh .husky/commit-msg'],
        ['pre-commit', 'sh .husky/pre-commit'],
      ])
    })

    test('pre-commit: each hook id, run on every file', async () => {
      const dir = await root({
        '.pre-commit-config.yaml':
          'repos:\n  - repo: x\n    hooks:\n      - id: eslint\n      - id: "ruff"\n      - id: eslint\n',
      })
      const { catalog } = await collectWalk(dir)
      expect(hookTasks(catalog)).toEqual([
        ['arm', 'pre-commit install'],
        ['eslint', 'pre-commit run eslint --all-files'],
        ['ruff', 'pre-commit run ruff --all-files'],
      ])
    })

    test('absent when no hook manager is detected', async () => {
      const dir = await root({ 'package.json': '{}' })
      expect(report((await collectWalk(dir)).catalog, 'hook-manager')).toBeUndefined()
    })
  })
})

describe('the package-manager runner', () => {
  test('offers install and install-frozen', async () => {
    const dir = await root({ 'package.json': '{}', 'bun.lock': '' })
    const { catalog } = await collectWalk(dir)
    const tasks = report(catalog, 'package-manager')?.tasks ?? []
    expect(tasks.map((t) => [t.path, t.argv.join(' '), t.cwd, t.source])).toEqual([
      [['package-manager', '.', 'bun', 'install'], 'bun install', '.', 'bun.lock'],
      [
        ['package-manager', '.', 'bun', 'install-frozen'],
        'bun install --frozen-lockfile',
        '.',
        'bun.lock',
      ],
    ])
    expect(tasks.every((t) => t.origin === 'synthesized')).toBe(true)
    expect(tasks[0]!.tags).toEqual(['package-manager', 'bun', 'node', '.'])
  })

  test('a workspace member’s install is the root’s, listed once', async () => {
    const dir = await root({
      'package.json': '{"workspaces":["packages/*"]}',
      'bun.lock': '',
      'packages/a/package.json': '{}',
      'packages/b/package.json': '{}',
    })
    const { catalog } = await collectWalk(dir)
    expect(report(catalog, 'package-manager')?.tasks.map((t) => t.display)).toEqual([
      'bun install',
      'bun install --frozen-lockfile',
    ])
  })

  test('an unlocked fallback offers install only', async () => {
    const dir = await root({ 'package.json': '{}' })
    const { catalog } = await collectWalk(dir)
    expect(report(catalog, 'package-manager')?.tasks.map((t) => t.display)).toEqual(['npm install'])
  })

  test('one install per ecosystem and package', async () => {
    const dir = await root({ 'go/go.mod': 'module x\n', 'py/uv.lock': '' })
    const { catalog } = await collectWalk(dir)
    expect(report(catalog, 'package-manager')?.tasks.map((t) => [t.cwd, t.display])).toEqual([
      // go has no directory flag, so it runs in `cwd`; uv takes `--project`.
      ['go', 'go mod download'],
      ['.', 'uv sync --project py'],
      ['.', 'uv sync --locked --project py'],
    ])
  })

  test('absent with nothing to install', async () => {
    const dir = await root({ 'README.md': '' })
    expect(report((await collectWalk(dir)).catalog, 'package-manager')).toBeUndefined()
  })

  test('absent when only one runner tool is registered', async () => {
    const { just } = await import('../src/plugins/runners/index.ts')
    const dir = await root({ 'package.json': '{}', justfile: 'a:\n    echo\n' })
    const { catalog } = await detectAndCollect(dir, {
      tools: [just],
      discovery: 'walk',
      makeRunner: fakeRunners([]).make,
      which: fakeWhich({}),
    })
    expect(catalog.reports.map((r) => r.runner)).toEqual(['just'])
  })
})

describe('workspaces, unlocked installs and install directories', () => {
  test('missingDeps skips a pinned manager with no lockfile', async () => {
    const dir = await root({ 'package.json': JSON.stringify({ packageManager: 'npm@10.0.0' }) })
    const profile = await detect(dir)
    expect(project.install(profile).map((a) => a.argv)).toEqual([['npm', 'install']])
    expect(project.missingDeps(profile)).toEqual([])
  })

  test('a cargo workspace with no lockfile installs once, at its root', async () => {
    const dir = await root({
      'Cargo.toml': '[workspace]\nmembers = ["crates/*"]\n',
      'crates/a/Cargo.toml': '[package]\nname = "a"\n',
      'crates/b/Cargo.toml': '[package]\nname = "b"\n',
    })
    const profile = await detect(dir)
    expect(project.install(profile, 'crates/a')).toMatchObject([
      { tool: 'cargo', dir: '.', argv: ['cargo', 'fetch'] },
    ])
    const { catalog } = await collectWalk(dir)
    expect(report(catalog, 'package-manager')?.tasks.map((t) => [t.cwd, t.display])).toEqual([
      ['.', 'cargo fetch'],
    ])
  })

  test('a node workspace with no lockfile installs once, at its root', async () => {
    const dir = await root({
      'package.json': JSON.stringify({ workspaces: ['packages/*'] }),
      'packages/a/package.json': '{}',
      'packages/b/package.json': '{}',
      'tools/c/package.json': '{}',
    })
    const profile = await detect(dir)
    expect(project.install(profile, 'packages/a').map((a) => [a.dir, a.argv.join(' ')])).toEqual([
      ['.', 'npm install'],
    ])
    // Not a member, so it installs on its own.
    expect(project.install(profile, 'tools/c').map((a) => a.dir)).toEqual(['tools/c'])
  })

  test('a nested install names its directory in argv, and cwd stays "."', async () => {
    const dir = await root({
      'apps/web/package.json': '{}',
      'apps/web/pnpm-lock.yaml': '',
      'crates/x/Cargo.toml': '[package]\nname = "x"\n',
      'crates/x/Cargo.lock': '',
    })
    const { catalog } = await collectWalk(dir)
    expect(report(catalog, 'package-manager')?.tasks.map((t) => [t.cwd, t.argv])).toEqual([
      ['.', ['pnpm', '--dir', 'apps/web', 'install']],
      ['.', ['pnpm', '--dir', 'apps/web', 'install', '--frozen-lockfile']],
      ['.', ['cargo', 'fetch', '--manifest-path', 'crates/x/Cargo.toml']],
      ['.', ['cargo', 'fetch', '--locked', '--manifest-path', 'crates/x/Cargo.toml']],
    ])
  })

  test('each manager with a directory flag puts it in argv', async () => {
    const cases: Array<[Record<string, string>, string[]]> = [
      [{ 'w/package.json': '{}', 'w/package-lock.json': '' }, ['npm', '--prefix', 'w', 'ci']],
      [{ 'w/package.json': '{}', 'w/bun.lock': '' }, ['bun', '--cwd', 'w', 'install']],
      [{ 'w/package.json': '{}', 'w/yarn.lock': '' }, ['yarn', '--cwd', 'w', 'install']],
      [{ 'w/pyproject.toml': '', 'w/uv.lock': '' }, ['uv', 'sync', '--project', 'w']],
      [{ 'w/pyproject.toml': '', 'w/poetry.lock': '' }, ['poetry', '--directory', 'w', 'install']],
      [{ 'w/Gemfile': '', 'w/Gemfile.lock': '' }, ['bundle', 'install', '--gemfile', 'w/Gemfile']],
    ]
    for (const [files, argv] of cases) {
      const { catalog } = await collectWalk(await root(files))
      const first = report(catalog, 'package-manager')?.tasks.find(
        (t) => t.path.at(-1) === 'install',
      )
      expect([first?.cwd, first?.argv]).toEqual(['.', argv])
    }
  })

  test('a nested package that is not a workspace member does not take the root lockfile', async () => {
    const dir = await root({
      'package.json': '{}',
      'package-lock.json': '',
      'tools/x/package.json': JSON.stringify({ dependencies: { left: '1' } }),
    })
    const profile = await detect(dir)
    expect(project.install(profile, 'tools/x').map((a) => [a.dir, a.argv.join(' ')])).toEqual([
      ['tools/x', 'npm install'],
    ])
    expect(project.missingDeps(profile, 'tools/x')).toEqual([])
  })

  describe('a package listed by a nested root and by the root', () => {
    // The dev repo's layout: `a/` lists `b/*`, has no lockfile and is not a root
    // member. The root lists `a/b/*` directly and holds the lockfile.
    const files = {
      'package.json': JSON.stringify({ workspaces: ['a/b/*'] }),
      'bun.lock': '',
      'a/package.json': JSON.stringify({ workspaces: ['b/*'] }),
      'a/b/x/package.json': JSON.stringify({ scripts: { dev: 'vite' } }),
      'a/c/package.json': '{}',
    }

    test('takes the outer root’s lockfile when the nested root chooses nothing', async () => {
      const dir = await root(files)
      const profile = await detect(dir)
      expect(project.packageManagers(profile, 'a/b/x')).toEqual([
        {
          tool: 'bun',
          ecosystem: 'node',
          dir: '.',
          source: 'bun.lock',
          locked: true,
          fallback: false,
        },
      ])
      const { catalog } = await collectWalk(dir)
      const dev = catalog.reports
        .flatMap((r) => r.tasks)
        .find((t) => t.path.at(-1) === 'dev' && t.argv.includes('a/b/x'))
      expect(dev?.argv.slice(0, 3)).toEqual(['bun', 'run', '--cwd'])
    })

    test('a non-member under the nested root stays standalone', async () => {
      const profile = await detect(await root(files))
      expect(project.packageManagers(profile, 'a/c')).toMatchObject([
        { tool: 'npm', dir: 'a/c', fallback: true },
      ])
    })

    test('the nested root’s own lockfile still wins when it has one', async () => {
      const profile = await detect(await root({ ...files, 'a/yarn.lock': '' }))
      expect(project.packageManagers(profile, 'a/b/x')).toMatchObject([
        { tool: 'yarn', dir: 'a', locked: true },
      ])
    })
  })

  test('a member of a nested root that is itself a root member takes the root manager', async () => {
    const dir = await root({
      'package.json': JSON.stringify({ workspaces: ['a'] }),
      'pnpm-lock.yaml': '',
      'pnpm-workspace.yaml': "packages:\n  - 'a'\n",
      'a/package.json': JSON.stringify({ workspaces: ['b/*'] }),
      'a/b/x/package.json': '{}',
      'a/c/package.json': '{}',
    })
    const profile = await detect(dir)
    expect(project.packageManagers(profile, 'a/b/x')).toMatchObject([
      { tool: 'pnpm', dir: '.', locked: true },
    ])
    // Under the member `a` but listed by no root, so it does not take a lockfile
    // from a parent directory.
    expect(project.packageManagers(profile, 'a/c')).toMatchObject([
      { tool: 'npm', dir: 'a/c', fallback: true },
    ])
  })

  test('with no lockfile anywhere, a chained member installs at the nearest covering root', async () => {
    const dir = await root({
      'package.json': JSON.stringify({ workspaces: ['a', 'a/b/*'] }),
      'a/package.json': JSON.stringify({ workspaces: ['b/*'] }),
      'a/b/x/package.json': '{}',
    })
    const profile = await detect(dir)
    expect(project.packageManagers(profile, 'a/b/x')).toMatchObject([
      { tool: 'npm', dir: 'a', source: 'a/package.json', locked: false, fallback: true },
    ])
  })

  test('a root with unknown members covers everything under a nested root', async () => {
    const dir = await root({
      'package.json': '{}',
      'pnpm-lock.yaml': '',
      'pnpm-workspace.yaml': 'catalog:\n  react: ^19\n',
      'a/package.json': JSON.stringify({ workspaces: ['b/*'] }),
      'a/b/x/package.json': '{}',
      'a/c/package.json': '{}',
    })
    const profile = await detect(dir)
    for (const pkg of ['a/b/x', 'a/c']) {
      expect(project.packageManagers(profile, pkg)).toMatchObject([
        { tool: 'pnpm', dir: '.', locked: true },
      ])
    }
  })

  test('a nested root with unknown members chooses before the outer root', async () => {
    const dir = await root({
      'package.json': JSON.stringify({ workspaces: ['a'] }),
      'bun.lock': '',
      'a/package.json': '{}',
      'a/pnpm-workspace.yaml': 'catalog:\n  react: ^19\n',
      'a/z/q/package.json': '{}',
    })
    const profile = await detect(dir)
    expect(project.packageManagers(profile, 'a/z/q')).toMatchObject([{ tool: 'pnpm', dir: 'a' }])
  })

  test('a pnpm member, listed in pnpm-workspace.yaml, takes the root lockfile', async () => {
    const dir = await root({
      'package.json': '{}',
      'pnpm-lock.yaml': '',
      'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - '!apps/legacy'\n",
      'apps/web/package.json': '{}',
      'apps/legacy/package.json': '{}',
    })
    const profile = await detect(dir)
    expect(project.packageManagers(profile, 'apps/web')).toMatchObject([
      { tool: 'pnpm', dir: '.', locked: true },
    ])
    // Negated, so not a member: it falls back to installing on its own.
    expect(project.packageManagers(profile, 'apps/legacy')).toMatchObject([
      { tool: 'npm', dir: 'apps/legacy', fallback: true },
    ])
  })

  test('a pnpm member under a zero-indent packages list takes the root lockfile', async () => {
    const dir = await root({
      'package.json': '{}',
      'pnpm-lock.yaml': '',
      'pnpm-workspace.yaml': "packages:\n- 'packages/*'\n",
      'packages/a/package.json': '{}',
    })
    const profile = await detect(dir)
    expect(project.install(profile, 'packages/a').map((a) => [a.dir, a.argv.join(' ')])).toEqual([
      ['.', 'pnpm install'],
    ])
  })

  test('a pnpm-workspace.yaml with no readable packages keeps the walk up to its lockfile', async () => {
    const dir = await root({
      'package.json': '{}',
      'pnpm-lock.yaml': '',
      'pnpm-workspace.yaml': 'catalog:\n  react: ^19\n',
      'tools/x/package.json': '{}',
    })
    const profile = await detect(dir)
    expect(project.packageManagers(profile, 'tools/x')).toMatchObject([
      { tool: 'pnpm', dir: '.', locked: true },
    ])
  })

  test('a crate in [workspace] exclude does not take the workspace lockfile', async () => {
    const dir = await root({
      'Cargo.toml': '[workspace]\nmembers = ["crates/*"]\nexclude = ["crates/old"]\n',
      'Cargo.lock': '',
      'crates/a/Cargo.toml': '[package]\nname = "a"\n',
      'crates/old/Cargo.toml': '[package]\nname = "old"\n',
    })
    const profile = await detect(dir)
    expect(project.packageManagers(profile, 'crates/a')).toMatchObject([{ dir: '.', locked: true }])
    expect(project.packageManagers(profile, 'crates/old')).toMatchObject([
      { tool: 'cargo', dir: 'crates/old', locked: false },
    ])
  })
})
