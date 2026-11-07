// The README's example, then the same packages installed the way npm lays them
// out and run through the launcher. Imports the package by name only.

import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

import { spawnRunner } from '@osdlc/command-seam'
import { afterAll, expect, test } from 'vitest'

import {
  binaryExt,
  binaryFileName,
  binaryPathInPackage,
  type BinaryProduct,
  cargoTargetDir,
  type CargoTargetDirOptions,
  copyExecutable,
  findPlatform,
  hostPlatform,
  launcherManifest,
  type LauncherManifestOptions,
  type LauncherOptions,
  type Manifest,
  NPM_PLATFORMS,
  type NpmPlatform,
  platformKey,
  platformManifest,
  type PlatformManifestOptions,
  platformPackageName,
  publishPackages,
  type PublishOptions,
  renderLauncher,
  writeJson,
} from '@osdlc/npm-binary'

const out = mkdtempSync(join(tmpdir(), 'npm-binary-example-'))
afterAll(() => rmSync(out, { recursive: true, force: true }))

const product: BinaryProduct = {
  binary: 'tool',
  launcher: '@acme/tool',
  scope: '@acme',
  platformPrefix: 'tool',
  binaryDir: 'bin',
}
const version = '1.0.0'

// A stand-in for each platform's build: a script that prints its arguments and
// exits 7.
const built = join(out, 'built-tool')
writeFileSync(built, '#!/bin/sh\necho "tool got: $*"\nexit 7\n')

/** One package per platform, each holding that platform's build. */
function writePlatformPackage(platform: NpmPlatform): string {
  const dir = join(out, 'packages', platformKey(platform))
  mkdirSync(join(dir, product.binaryDir), { recursive: true })
  const options: PlatformManifestOptions = {
    version,
    description: `The tool binary for ${platformKey(platform)}.`,
    template: { license: 'MIT' },
  }
  writeJson(join(dir, 'package.json'), platformManifest(product, platform, options))
  copyExecutable(built, join(dir, binaryPathInPackage(product, platform)))
  return dir
}

/** The launcher package users install. */
function writeLauncherPackage(): string {
  const dir = join(out, 'packages', 'launcher')
  mkdirSync(join(dir, 'bin'), { recursive: true })
  const options: LauncherManifestOptions = {
    version,
    description: 'The tool CLI.',
    launcherPath: 'bin/tool.js',
  }
  const manifest: Manifest = launcherManifest(product, NPM_PLATFORMS, options)
  writeJson(join(dir, 'package.json'), manifest)
  const launcher: LauncherOptions = { debugEnv: 'TOOL_DEBUG' }
  writeFileSync(join(dir, 'bin', 'tool.js'), renderLauncher(product, NPM_PLATFORMS, launcher))
  return dir
}

const platformDirs = NPM_PLATFORMS.map(writePlatformPackage)
const launcherDir = writeLauncherPackage()

test('the names', () => {
  const windows = findPlatform(NPM_PLATFORMS, 'win32-x64')
  expect(platformPackageName(product, windows)).toBe('@acme/tool-win32-x64')
  expect(binaryExt(windows)).toBe('.exe')
  expect(binaryFileName(product, windows)).toBe('tool.exe')
  expect(binaryPathInPackage(product, windows)).toBe('bin/tool.exe')
})

test('the launcher lists every platform package as an optional dependency', () => {
  const manifest = JSON.parse(readFileSync(join(launcherDir, 'package.json'), 'utf8')) as Manifest
  expect(manifest.bin).toEqual({ tool: 'bin/tool.js' })
  expect(Object.keys(manifest.optionalDependencies as object)).toEqual(
    NPM_PLATFORMS.map((p) => platformPackageName(product, p)),
  )
})

const host = (() => {
  try {
    return hostPlatform(NPM_PLATFORMS)
  } catch {
    return undefined
  }
})()

// Runs the launcher with Node from a node_modules laid out as npm installs it:
// the launcher plus the one platform package for this host.
test.skipIf(host === undefined || process.platform === 'win32')(
  'installed, the launcher runs the binary and passes its exit code through',
  () => {
    const modules = join(out, 'consumer', 'node_modules', '@acme')
    const platform = host!
    cpSync(launcherDir, join(modules, 'tool'), { recursive: true })
    cpSync(
      platformDirs[NPM_PLATFORMS.indexOf(platform)]!,
      join(modules, `tool-${platformKey(platform)}`),
      {
        recursive: true,
      },
    )
    const result = spawnRunner(process.execPath).run(
      [join(modules, 'tool', 'bin', 'tool.js'), 'a', 'b c'],
      { cwd: out, env: { ...process.env, TOOL_DEBUG: '1' } },
    )
    expect(result.stdout).toBe('tool got: a b c\n')
    expect(result.stderr).toContain(`package=@acme/tool-${platformKey(platform)}`)
    expect(result.exitCode).toBe(7)
  },
)

test("cargo's target directory comes from cargo metadata", () => {
  // Without `runner`, this runs `cargo metadata` in `cwd`.
  const options: CargoTargetDirOptions = {
    cwd: out,
    runner: {
      run: () => ({ exitCode: 0, stdout: '{"target_directory":"/w/target"}', stderr: '' }),
    },
  }
  expect(cargoTargetDir(options)).toBe('/w/target')
})

// publishPackages runs the npm on PATH. Here a stand-in npm that has nothing
// published and records each publish.
test.skipIf(process.platform === 'win32')(
  'publishing goes platform packages first, the launcher last',
  async () => {
    const bin = join(out, 'fake-bin')
    const log = join(out, 'publish.log')
    mkdirSync(bin)
    writeFileSync(
      join(bin, 'npm'),
      `#!/bin/sh\n[ "$1" = view ] && exit 1\nbasename "$PWD" >> ${JSON.stringify(log)}\n`,
    )
    chmodSync(join(bin, 'npm'), 0o755)
    const path = process.env.PATH
    process.env.PATH = `${bin}${delimiter}${path}`
    try {
      const options: PublishOptions = { platformDirs, launcherDir, dryRun: true }
      await publishPackages(options)
    } finally {
      process.env.PATH = path
    }
    expect(readFileSync(log, 'utf8').trim().split('\n')).toEqual([
      ...NPM_PLATFORMS.map(platformKey),
      'launcher',
    ])
  },
)
