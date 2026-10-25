/**
 * Choosing plugins, and writing a tool of your own. A downstream `ToolDef` is
 * the same shape as a built-in, so it can do anything a built-in can.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import {
  createProject,
  DEFAULT_PROBE_TIMEOUT_MS,
  evidence,
  type EcosystemDef,
  type HookDef,
  type HookManagerRole,
  type LanguageRule,
  type ManifestDef,
  type Marker,
  type PackageManagerRole,
  type ProbeCost,
  type ProviderContext,
  type ProviderKind,
  type ProviderResult,
  type RoleName,
  type RunnerContext,
  type RunnerProbe,
  type RunnerRole,
  type ToolDef,
  type ToolFact,
  type ToolManagerRole,
  validateToolDef,
} from '@osdlc/system-model/detect'
import { denoEcosystem, denoTasks, denoTools } from '@osdlc/system-model/deno'
import { dotnet, dotnetEcosystem, dotnetTools } from '@osdlc/system-model/dotnet'
import { go, goEcosystem, goTools } from '@osdlc/system-model/go'
import { gradle, jvmEcosystem, jvmTools, maven, sbt } from '@osdlc/system-model/jvm'
import {
  bun,
  nodeEcosystem,
  nodeScripts,
  nodeTools,
  npm,
  pnpm,
  yarn,
} from '@osdlc/system-model/node'
import { composer, phpEcosystem, phpTools } from '@osdlc/system-model/php'
import {
  hatch,
  pdm,
  pip,
  poe,
  poetry,
  python,
  pythonEcosystem,
  pythonTools,
  uv,
} from '@osdlc/system-model/python'
import { bundler, rake, rubyEcosystem, rubyTools } from '@osdlc/system-model/ruby'
import {
  cmakePresets,
  devbox,
  dockerCompose,
  githubActions,
  goTask,
  just,
  make,
  moon,
  nx,
  procfile,
  runnerTools,
  turbo,
  vscodeTasks,
  type MoonProjectFact,
} from '@osdlc/system-model/runners'
import { cargo, cargoAliases, rustEcosystem, rustTools } from '@osdlc/system-model/rust'
import { swiftEcosystem, swiftpm, swiftTools } from '@osdlc/system-model/swift'
import {
  direnv,
  GIT_HOOKS,
  husky,
  lefthook,
  mise,
  preCommit,
  proto,
  toolTools,
} from '@osdlc/system-model/tools'

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

test('register only the plugins you need', async () => {
  const project = createProject({ tools: [...nodeTools, ...rustTools] })
  const root = repo({
    'package.json': '{}',
    'Cargo.toml': '[package]\nname = "x"\n',
    justfile: 'a:\n',
  })
  const profile = await project.detect(root, { discovery: 'walk' })
  // just is not registered, so its justfile is not evidence of anything.
  expect(profile.tools).toEqual(['node-scripts', 'cargo'])
})

test('each plugin exports its tools and its ecosystem', () => {
  const groups: Array<[readonly ToolDef[], ToolDef[], EcosystemDef | undefined]> = [
    [nodeTools, [bun, pnpm, yarn, npm, nodeScripts], nodeEcosystem],
    [rustTools, [cargo, cargoAliases], rustEcosystem],
    [pythonTools, [uv, poetry, pip, python, poe, pdm, hatch], pythonEcosystem],
    [jvmTools, [gradle, maven, sbt], jvmEcosystem],
    [phpTools, [composer], phpEcosystem],
    [swiftTools, [swiftpm], swiftEcosystem],
    [rubyTools, [bundler, rake], rubyEcosystem],
    [goTools, [go], goEcosystem],
    [denoTools, [denoTasks], denoEcosystem],
    [dotnetTools, [dotnet], dotnetEcosystem],
    [
      runnerTools,
      [
        moon,
        just,
        make,
        turbo,
        goTask,
        dockerCompose,
        githubActions,
        nx,
        vscodeTasks,
        devbox,
        procfile,
        cmakePresets,
      ],
      undefined,
    ],
    [toolTools, [mise, proto, direnv, lefthook, husky, preCommit], undefined],
  ]
  for (const [all, named, ecosystem] of groups) {
    expect(all).toEqual(named)
    for (const tool of named) expect(tool.ecosystem).toBe(ecosystem ?? tool.ecosystem)
  }
  expect(GIT_HOOKS).toContain('pre-push')
  // cargo both installs dependencies and lists tasks.
  const roles: RoleName[] = ['packageManager', 'runner']
  expect(roles.every((role) => cargo.roles[role] !== undefined)).toBe(true)
})

test('moon describes its projects when execution is allowed', async () => {
  const root = repo({ '.moon/workspace.yml': 'projects: ["apps/*"]\n', 'apps/web/moon.yml': '' })
  const project = createProject({ tools: [moon] })
  const makeRunner = () => ({
    run: async () => ({
      exitCode: 0,
      stdout: JSON.stringify({
        projects: [{ id: 'web', source: 'apps/web', layer: 'application' }],
      }),
      stderr: '',
    }),
  })
  const profile = await project.detect(root, { discovery: 'walk', allowExec: true, makeRunner })
  const web = profile.packages.flatMap((p) => p.tools).find((t) => t.facts !== undefined)
  const fact = web?.facts?.[0]?.fact as MoonProjectFact
  expect([fact.id, fact.layer]).toEqual(['web', 'application'])
})

// A downstream tool: every `*.sh` under `scripts/` is a task.
const SCRIPTS: Marker = { files: '/scripts/', tier: 'files' }
const kind: ProviderKind = 'parse'
// Each subprocess the runner starts gets this timeout (DEFAULT_PROBE_TIMEOUT_MS
// when unset); `CollectOptions.timeouts` can replace it per runner.
const cost: ProbeCost = 'cheap'
const probe: RunnerProbe = { timeoutMs: DEFAULT_PROBE_TIMEOUT_MS / 6, cost }

const bashScriptsRunner: RunnerRole = {
  kind,
  probe,
  chain: [
    { label: 'runner', hint: 'Shell scripts under scripts/.' },
    { label: 'script', hint: 'The script name.' },
  ],
  async collect(ctx: RunnerContext): Promise<ProviderResult> {
    const files = (await ctx.files('/scripts/*.sh')).sort()
    const tasks = files.map((source) => {
      const name = source.slice('scripts/'.length, -'.sh'.length)
      return {
        id: `bash-scripts:${source}`,
        runner: 'bash-scripts',
        path: ['bash-scripts', name],
        argv: ['bash', source],
        cwd: '.',
        display: `bash ${source}`,
        parameters: [],
        source,
        origin: 'declared' as const,
        tags: ['bash'],
        persistent: { value: false, declared: false },
        executes: 'local' as const,
      }
    })
    return { status: tasks.length > 0 ? 'ok' : 'absent', tasks, diagnostics: [] }
  },
}

// A whole ecosystem can be data too.
const nimbleManifest: ManifestDef = { files: '*.nimble', tool: 'nimble' }
const nim: LanguageRule = { id: 'nim' }
const nimEcosystem: EcosystemDef = {
  id: 'nim',
  manifests: [nimbleManifest],
  languages: [nim],
  tools: ['nimble'],
}
const nimbleInstall: PackageManagerRole = {
  lockfiles: ['nimble.lock'],
  install: ['nimble', 'install', '-d'],
}

const bashScripts: ToolDef = {
  id: 'bash-scripts',
  homepage: 'https://www.gnu.org/software/bash/',
  description: 'Shell scripts kept under scripts/.',
  brand: { color: '#4eaa25' },
  binary: 'bash',
  markers: [SCRIPTS],
  // Evidence a file name cannot give: a script with a bash shebang outside scripts/.
  async detect(ctx: ProviderContext) {
    const text = await ctx.readText('setup')
    return text?.startsWith('#!/bin/bash') ? [evidence('content', 'setup', '#!/bin/bash')] : []
  },
  async describe(): Promise<ToolFact[]> {
    return []
  },
  roles: { runner: bashScriptsRunner },
}

const nimble: ToolDef = {
  id: 'nimble',
  ecosystem: nimEcosystem,
  roles: { packageManager: nimbleInstall },
}

test('a downstream tool registered beside the built-ins', async () => {
  // A host loading tools from a module checks their shape first.
  expect(validateToolDef(bashScripts)).toEqual([])
  expect(validateToolDef({ id: 'broken', roles: { runner: {} } })).toContain(
    'roles.runner.collect is not a function',
  )
  const project = createProject({ tools: [bashScripts, nimble] })
  const root = repo({
    'scripts/deploy.sh': 'echo deploy\n',
    'scripts/seed.sh': 'echo seed\n',
    'app.nimble': 'version = "0.1.0"\n',
    'nimble.lock': '{}',
  })
  const profile = await project.detect(root, { discovery: 'walk' })
  expect(profile.ecosystems).toEqual(['nim'])
  expect(profile.languages).toEqual(['nim'])

  const catalog = await project.runners.collect(profile)
  const scripts = catalog.reports.find((r) => r.runner === 'bash-scripts')!
  expect(scripts.tasks.map((t) => t.argv)).toEqual([
    ['bash', 'scripts/deploy.sh'],
    ['bash', 'scripts/seed.sh'],
  ])
  expect(project.install(profile).map((a) => a.argv)).toEqual([['nimble', 'install', '-d']])
})

test('tool and hook manager roles are data', async () => {
  const asdf: ToolManagerRole = {
    configs: ['/.tool-versions'],
    install: ['asdf', 'install'],
    exec: (binary) => ['asdf', 'exec', binary],
  }
  const hookConfig = '/.githooks/'
  const githooks: HookManagerRole = {
    configs: [hookConfig],
    arm: () => ['git', 'config', 'core.hooksPath', '.githooks'],
    async hooks(ctx) {
      const files = await ctx.files(hookConfig)
      return files.map((source): HookDef => ({
        name: source.split('/').pop()!,
        argv: ['sh', source],
        source,
      }))
    },
  }
  const project = createProject({
    tools: [
      { id: 'asdf', roles: { toolManager: asdf } },
      { id: 'githooks', roles: { hookManager: githooks } },
    ],
  })
  const root = repo({ '.tool-versions': 'nodejs 22\n', '.githooks/pre-commit': 'exit 0\n' })
  const profile = await project.detect(root, { discovery: 'walk' })
  expect(project.execPrefix(profile, 'node')).toEqual(['asdf', 'exec', 'node'])
  expect(project.armHooks(profile)[0]?.argv).toEqual([
    'git',
    'config',
    'core.hooksPath',
    '.githooks',
  ])
})
