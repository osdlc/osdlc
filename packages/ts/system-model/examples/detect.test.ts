/**
 * Detection used the way a consumer uses it: through the package name only.
 * `tests/exports.test.ts` checks that the examples together use every export.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import {
  createProject,
  DEFAULT_EXCLUDES,
  evidence,
  MAX_READ_BYTES,
  MAX_WALK_DEPTH,
  MAX_WALK_FILES,
  type CargoFact,
  type DepFact,
  type DepFactKind,
  type DepFactSpecifierKind,
  type Detected,
  type DetectOptions,
  type DiscoveryMode,
  type GemfileFact,
  type GoModFact,
  type MalformedManifest,
  type ManifestFacts,
  type Package,
  type PackageJsonFact,
  type Project,
  type ProjectOptions,
  type ProjectProfile,
  type PyprojectFact,
} from '@osdlc/system-model/detect'
import type { Evidence, EvidenceKind } from '@osdlc/system-model'
import { builtins, BUILTIN_TOOL_IDS, type BuiltinToolId } from '@osdlc/system-model/builtins'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** A throwaway repository. `files` maps root-relative paths to contents. */
function repo(files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'project-example-')))
  roots.push(root)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

const options: ProjectOptions = { tools: builtins }
const project: Project = createProject(options)
// Fixtures are not git repositories, so list files by walking the tree.
const walk: DetectOptions = { discovery: 'walk' satisfies DiscoveryMode }

test('a Tauri-style folder is one package with two ecosystems', async () => {
  const root = repo({
    'package.json': JSON.stringify({
      name: 'app',
      packageManager: 'pnpm@9.1.0',
      devDependencies: { typescript: '^5' },
    }),
    'pnpm-lock.yaml': '',
    'src-tauri/Cargo.toml': '[package]\nname = "app"\nversion = "0.1.0"\n',
    'src-tauri/Cargo.lock': '',
  })
  const profile: ProjectProfile = await project.detect(root, walk)

  expect(profile.ecosystems).toEqual(['node', 'rust'])
  expect(profile.languages).toEqual(['typescript', 'rust'])

  const app: Package = profile.packages.find((p) => p.dir === '.')!
  const pnpm: Detected = app.tools.find((t) => t.tool === 'pnpm')!
  // The `packageManager` pin is the most direct evidence, so it comes first.
  // `kind` is widened to string on the wire; `EvidenceKind` names the four known kinds.
  const direct: EvidenceKind = 'manifest'
  expect(pnpm.evidence.map((e) => e.kind)).toContain(direct)
  expect(pnpm.evidence.map((e) => e.source)).toContain('package.json#packageManager')

  const facts: ManifestFacts = app.manifests
  const pkg: PackageJsonFact | undefined = facts.packageJson
  const dep: DepFact | undefined = pkg?.deps?.[0]
  const kind: DepFactKind | undefined = dep?.kind
  const spec: DepFactSpecifierKind | undefined = dep?.specifierKind
  expect([dep?.name, kind, spec]).toEqual(['typescript', 'dev', 'registry'])

  const crate = profile.packages.find((p) => p.dir === 'src-tauri')!
  const cargo: CargoFact | undefined = crate.manifests.cargo
  expect(cargo?.name).toBe('app')
})

test('go, ruby and python manifests are read once each', async () => {
  const root = repo({
    'go.mod': 'module example.com/svc\n\ngo 1.22\n\nrequire github.com/pkg/errors v0.9.1\n',
    'tools/Gemfile': "source 'https://rubygems.org'\ngem 'rake'\n",
    'py/pyproject.toml': '[project]\nname = "py"\nversion = "1.0"\n',
  })
  const profile = await project.detect(root, walk)
  const at = (dir: string) => profile.packages.find((p) => p.dir === dir)!.manifests

  const goMod: GoModFact | undefined = at('.').goMod
  const gemfile: GemfileFact | undefined = at('tools').gemfile
  const pyproject: PyprojectFact | undefined = at('py').pyproject
  expect(goMod?.module).toBe('example.com/svc')
  expect(gemfile?.deps?.map((d) => d.name)).toEqual(['rake'])
  expect(pyproject?.name).toBe('py')
})

test('a malformed manifest is reported, and its package still exists', async () => {
  const root = repo({ 'package.json': '{ not json' })
  const profile = await project.detect(root, walk)
  const bad: MalformedManifest[] = profile.malformed
  expect(bad.map((m) => m.path)).toEqual(['package.json'])
  expect(profile.packages.map((p) => p.dir)).toEqual(['.'])
})

test('excludes skip data trees', async () => {
  const root = repo({
    'package.json': '{}',
    'fixtures/other/Cargo.toml': '[package]\nname = "x"\n',
  })
  expect(DEFAULT_EXCLUDES).toContain('node_modules')
  const profile = await project.detect(root, { ...walk, excludePaths: ['fixtures'] })
  expect(profile.ecosystems).toEqual(['node'])
})

test('reads and the walk are bounded', async () => {
  // A file over MAX_READ_BYTES is not read. A walk that reaches MAX_WALK_FILES
  // or MAX_WALK_DEPTH says so in `profile.diagnostics`.
  const root = repo({ 'package.json': ' '.repeat(MAX_READ_BYTES + 1) })
  const profile = await project.detect(root, walk)
  expect(profile.malformed[0]?.error).toMatch(/larger than/)
  expect(profile.diagnostics).toEqual([])
  expect([MAX_WALK_FILES, MAX_WALK_DEPTH]).toEqual([50_000, 32])
})

test('findRoot walks up to the repository root', async () => {
  const root = repo({ '.git/HEAD': '', 'packages/a/package.json': '{}' })
  expect(await project.findRoot(join(root, 'packages', 'a'))).toBe(root)
})

test('a command names its tool', () => {
  expect(project.toolForCommand('bunx vitest')?.id).toBe('bun')
  expect(project.toolForCommand('pip3 install x')?.id).toBe('pip')
  expect(project.toolForCommand('rm -rf /')).toBeUndefined()
})

test('evidence carries a tier, so the most direct claim sorts first', () => {
  const claims: Evidence[] = [
    evidence('files', 'pnpm-lock.yaml', 'pnpm-lock.yaml'),
    evidence('manifest', 'package.json#packageManager', 'packageManager'),
  ]
  expect(claims.sort((a, b) => a.tier - b.tier).map((e) => e.kind)).toEqual(['manifest', 'files'])
})

test('the built-in tools, by id', () => {
  const id: BuiltinToolId = 'pnpm'
  expect(BUILTIN_TOOL_IDS).toContain(id)
  expect(builtins.map((t) => t.id)).toEqual([...BUILTIN_TOOL_IDS])
  expect(project.ecosystems.map((e) => e.id)).toEqual([
    'node',
    'rust',
    'jvm',
    'python',
    'php',
    'deno',
    'swift',
    'ruby',
    'dotnet',
    'go',
  ])
})
