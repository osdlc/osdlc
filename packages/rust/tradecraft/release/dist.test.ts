// node --test packages/rust/tradecraft/release/dist.test.ts
import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, test } from 'node:test'

import {
  crateVersion,
  distTag,
  formula,
  launcherManifest,
  manifestVersion,
  matrix,
  npmTarballName,
  packageNames,
  placeholderManifest,
  platformManifest,
  renderLauncher,
  renderInstallScript,
  renderNotices,
  sumsLine,
  tagVersion,
} from './dist.ts'
import { PLATFORMS, platformPackageName, PRODUCT, releaseAssetName } from './product.ts'

describe('package manifests', () => {
  test('the launcher pins every platform package to its own version', () => {
    const manifest = launcherManifest('1.2.3')
    assert.equal(manifest['name'], '@osdlc/tradecraft')
    assert.deepEqual(
      manifest['optionalDependencies'],
      Object.fromEntries(PLATFORMS.map((p) => [platformPackageName(p), '1.2.3'])),
    )
    assert.deepEqual(manifest['bin'], { tradecraft: 'bin/launcher.js' })
    assert.equal(manifest['//'], undefined)
    assert.equal(manifest['license'], 'MIT OR Apache-2.0')
  })

  test('a platform package is restricted to its os and cpu', () => {
    const linuxArm = PLATFORMS.find((p) => p.os === 'linux' && p.cpu === 'arm64')!
    const manifest = platformManifest(linuxArm, '1.2.3')
    assert.equal(manifest['name'], '@osdlc/tradecraft-linux-arm64')
    assert.deepEqual(manifest['os'], ['linux'])
    assert.deepEqual(manifest['cpu'], ['arm64'])
    assert.equal(manifest['version'], '1.2.3')
  })

  test('every package names the repository, which npm provenance checks', () => {
    for (const m of [launcherManifest('1.0.0'), platformManifest(PLATFORMS[0]!, '1.0.0')]) {
      const repo = m['repository'] as { url: string }
      assert.equal(repo.url, 'git+https://github.com/osdlc/osdlc.git')
    }
  })

  test('the stage placeholders cover every published name, launcher last', () => {
    const names = packageNames()
    assert.equal(names.length, PLATFORMS.length + 1)
    assert.equal(names.at(-1), PRODUCT.launcher)
    const placeholder = placeholderManifest(names[0]!)
    assert.equal(placeholder['version'], '0.0.1-stage')
    assert.equal(placeholder['name'], names[0])
  })
})

test('the launcher script has no placeholder left and names every platform package', () => {
  const script = renderLauncher()
  assert.doesNotMatch(script, /\{\{\w+\}\}/)
  for (const p of PLATFORMS) assert.ok(script.includes(platformPackageName(p)))
  assert.ok(script.includes("const BINARY = 'tradecraft'"))
})

test('the matrix carries one entry per platform, with no Windows', () => {
  assert.deepEqual(
    matrix().include.map((e) => e['key']),
    ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64'],
  )
})

test('the Linux builds are static musl binaries', () => {
  for (const p of PLATFORMS.filter((p) => p.os === 'linux')) {
    assert.match(p.rustTarget, /-unknown-linux-musl$/)
    assert.equal(p.builder, 'zigbuild')
  }
})

describe('versions', () => {
  test('the crate version reads as a literal semver', () => {
    assert.match(crateVersion(), /^\d+\.\d+\.\d+/)
  })

  test('only the [package] version counts', () => {
    const toml = '[workspace]\nversion = "9.9.9"\n\n[package]\nname = "x"\nversion = "0.3.5"\n'
    assert.equal(manifestVersion(toml), '0.3.5')
    assert.throws(() => manifestVersion('[package]\nversion.workspace = true\n'))
  })

  test('a release tag gives its version', () => {
    assert.equal(tagVersion('tradecraft/v0.3.5'), '0.3.5')
    assert.equal(tagVersion('refs/tags/tradecraft/v1.0.0-rc.1'), '1.0.0-rc.1')
    assert.throws(() => tagVersion('tradecraft-core/v0.3.5'))
    assert.throws(() => tagVersion('v0.3.5'))
  })

  test('a pre-release publishes under next', () => {
    assert.equal(distTag('0.3.5'), 'latest')
    assert.equal(distTag('0.4.0-rc.1'), 'next')
  })
})

describe('release assets', () => {
  test('asset names carry the rustc target, the name cargo-binstall builds', () => {
    const mac = PLATFORMS.find((p) => p.rustTarget === 'aarch64-apple-darwin')!
    assert.equal(releaseAssetName(mac, '0.3.5'), 'tradecraft-0.3.5-aarch64-apple-darwin')
  })

  test('the binstall metadata in Cargo.toml points at those asset names', () => {
    const toml = readFileSync(join(import.meta.dirname, '..', 'Cargo.toml'), 'utf8')
    assert.ok(toml.includes('[package.metadata.binstall]'))
    assert.ok(toml.includes('pkg-fmt = "bin"'))
    assert.ok(
      toml.includes(
        'pkg-url = "https://github.com/osdlc/osdlc/releases/download/tradecraft/v{ version }/{ name }-{ version }-{ target }"',
      ),
    )
  })

  test('a SHA256SUMS line has two spaces between hash and name', () => {
    assert.equal(
      sumsLine(new TextEncoder().encode('abc'), 'f'),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  f',
    )
  })

  test('a scoped tarball name drops the @ and the slash', () => {
    assert.equal(npmTarballName('@osdlc/tradecraft', '0.3.5'), 'osdlc-tradecraft-0.3.5.tgz')
  })
})

test('notices leave out this workspace’s own path crates', () => {
  const text = renderNotices({
    licenses: [
      {
        name: 'MIT License',
        id: 'MIT',
        text: 'MIT text',
        used_by: [
          { crate: { name: 'serde', version: '1.0.0', source: 'registry+https://x' } },
          { crate: { name: 'tradecraft-core', version: '0.1.0', source: null } },
        ],
      },
      {
        name: 'Only ours',
        id: 'X',
        text: 'unused',
        used_by: [{ crate: { name: 'tiered-dirs', version: '0.1.0', source: null } }],
      },
    ],
  })
  assert.ok(text.includes('- serde 1.0.0'))
  assert.ok(!text.includes('tradecraft-core'))
  assert.ok(!text.includes('Only ours'))
})

describe('homebrew', () => {
  test('the formula covers every platform with the hash SHA256SUMS gives it', () => {
    const sums = PLATFORMS.map(
      (p, i) => `${String(i).repeat(64)}  ${releaseAssetName(p, '0.3.5')}`,
    ).join('\n')
    const rb = formula('0.3.5', sums)
    assert.match(rb, /^class Tradecraft < Formula$/m)
    assert.match(rb, /on_macos do/)
    assert.match(rb, /on_linux do/)
    for (const [i, p] of PLATFORMS.entries()) {
      assert.ok(
        rb.includes(
          `/tradecraft/v0.3.5/${releaseAssetName(p, '0.3.5')}"\n      sha256 "${String(i).repeat(64)}"`,
        ),
      )
    }
    assert.ok(rb.includes('license any_of: ["MIT", "Apache-2.0"]'))
  })

  test('a platform missing from SHA256SUMS fails the render', () => {
    assert.throws(() =>
      formula('0.3.5', `${'0'.repeat(64)}  tradecraft-0.3.5-aarch64-apple-darwin\n`),
    )
  })
})

describe('install.sh', () => {
  const script = join(import.meta.dirname, 'install.sh')

  test('is valid sh', () => {
    assert.equal(spawnSync('sh', ['-n', script]).status, 0)
  })

  test('the attached copy defaults to its release', () => {
    assert.ok(renderInstallScript('0.3.5').includes("DEFAULT_VERSION='0.3.5'\n"))
  })

  test('installs the asset for this machine and refuses a bad checksum', (t) => {
    const cpu = { arm64: 'aarch64', x64: 'x86_64' }[process.arch as string]
    const os = { darwin: 'apple-darwin', linux: 'unknown-linux-musl' }[process.platform as string]
    if (!cpu || !os) return t.skip(`no tradecraft build for ${process.platform}-${process.arch}`)
    const p = PLATFORMS.find((x) => x.rustTarget === `${cpu}-${os}`)!
    const root = mkdtempSync(join(tmpdir(), 'tradecraft-install-'))
    try {
      const release = join(root, 'tradecraft', 'v9.9.9')
      mkdirSync(release, { recursive: true })
      const name = releaseAssetName(p, '9.9.9')
      const body = '#!/bin/sh\necho tradecraft 9.9.9\n'
      writeFileSync(join(release, name), body)
      writeFileSync(
        join(release, 'SHA256SUMS'),
        `${sumsLine(new TextEncoder().encode(body), name)}\n`,
      )
      const env = { ...process.env, TRADECRAFT_DOWNLOAD_BASE: pathToFileURL(root).href }
      const to = join(root, 'bin')
      const ok = spawnSync('sh', [script, '--version', '9.9.9', '--to', to], {
        env,
        encoding: 'utf8',
      })
      assert.equal(ok.status, 0, ok.stderr)
      assert.equal(readFileSync(join(to, 'tradecraft'), 'utf8'), body)

      writeFileSync(join(release, 'SHA256SUMS'), `${'0'.repeat(64)}  ${name}\n`)
      rmSync(join(to, 'tradecraft'))
      const bad = spawnSync('sh', [script, '--version', '9.9.9', '--to', to], {
        env,
        encoding: 'utf8',
      })
      assert.notEqual(bad.status, 0)
      assert.match(bad.stderr, /checksum mismatch/)
      assert.ok(!existsSync(join(to, 'tradecraft')))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
