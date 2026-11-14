// The README's example, then the same packages installed the way npm lays them
// out and run through the launcher. Imports the package by name, and its own
// dependency @osdlc/command-seam to run Node.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

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
  type PublishResult,
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
// exits 7. Given `stop-launcher`, it sends SIGTERM to its parent (the launcher)
// and waits, so the launcher must forward the signal to end it.
const built = join(out, 'built-tool')
writeFileSync(
  built,
  [
    '#!/bin/sh',
    'if [ "$1" = stop-launcher ]; then kill -TERM "$PPID"; exec sleep 5; fi',
    'echo "tool got: $*"',
    'exit 7',
  ].join('\n'),
)

const packageDir = (platform: NpmPlatform) => join(out, 'packages', platformKey(platform))

/** One package per platform, each holding that platform's build. */
function writePlatformPackage(platform: NpmPlatform): string {
  const dir = packageDir(platform)
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

const posixHost = host !== undefined && process.platform !== 'win32'

/**
 * Packs the launcher and this host's platform package with `npm pack`, and
 * unpacks them into a node_modules laid out as npm installs them. Returns the
 * launcher script's path. Packing checks `files` and keeps the executable bit
 * the way a real install does.
 */
const install = (() => {
  let launcherScript: string | undefined
  return () => {
    if (launcherScript !== undefined) return launcherScript
    const tarballs = join(out, 'tarballs')
    const modules = join(out, 'consumer', 'node_modules', '@acme')
    mkdirSync(tarballs, { recursive: true })
    const unpack = (dir: string, dest: string) => {
      const packed = spawnRunner('npm').run(['pack', '--pack-destination', tarballs, '--json'], {
        cwd: dir,
      })
      expect(packed.exitCode, packed.stderr).toBe(0)
      const [{ filename }] = JSON.parse(packed.stdout) as [{ filename: string }]
      mkdirSync(dest, { recursive: true })
      const tar = spawnRunner('tar').run(
        ['-xzf', join(tarballs, filename), '-C', dest, '--strip-components=1'],
        { cwd: out },
      )
      expect(tar.exitCode, tar.stderr).toBe(0)
    }
    unpack(launcherDir, join(modules, 'tool'))
    unpack(packageDir(host!), join(modules, `tool-${platformKey(host!)}`))
    launcherScript = join(modules, 'tool', 'bin', 'tool.js')
    return launcherScript
  }
})()

test.skipIf(!posixHost)(
  'installed, the launcher runs the binary and passes its exit code through',
  () => {
    const result = spawnRunner(process.execPath).run([install(), 'a', 'b c'], {
      cwd: out,
      env: { ...process.env, TOOL_DEBUG: '1' },
    })
    expect(result.stdout).toBe('tool got: a b c\n')
    expect(result.stderr).toContain(`package=@acme/tool-${platformKey(host!)}`)
    expect(result.exitCode).toBe(7)
  },
  // The first call to install() runs `npm pack` twice, which overruns the 5 s default on a busy CI runner.
  30_000,
)

test.skipIf(!posixHost)(
  'SIGTERM to the launcher reaches the binary, and the launcher dies of it too',
  () => {
    const started = Date.now()
    const result = spawnRunner(process.execPath).run([install(), 'stop-launcher'], { cwd: out })
    expect(result.signal).toBe('SIGTERM')
    // The binary would sleep 5 s if the launcher had not forwarded the signal.
    expect(Date.now() - started).toBeLessThan(4000)
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

// publishPackages runs the npm on PATH. Here two stand-in runners: an
// `npm view` that finds nothing published, and an `npm publish` that records
// each package directory it runs in.
test('publishing goes platform packages first, the launcher last', async () => {
  const published: string[] = []
  const options: PublishOptions = {
    platformDirs,
    launcherDir,
    viewRunner: { run: async () => ({ exitCode: 1, stdout: '', stderr: 'npm error code E404' }) },
    publishRunner: {
      run: (_argv, { cwd }) => {
        published.push(basename(cwd))
        return { exitCode: 0 }
      },
    },
  }
  const result: PublishResult = await publishPackages(options)
  expect(published).toEqual([...NPM_PLATFORMS.map(platformKey), 'launcher'])
  expect(result.published.at(-1)).toBe('@acme/tool@1.0.0')
  expect(result.skipped).toEqual([])
})
