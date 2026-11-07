# @osdlc/npm-binary

Ship a compiled binary through npm the way esbuild and Biome do: one launcher
package that users install, plus one package per platform. Each platform
package is gated by `os` and `cpu`, and the launcher lists them all as
`optionalDependencies`, so npm downloads only the one that matches the host.
`npx your-tool` and `npm install -g your-tool` then run a native executable,
with no install script and no download from anywhere but the registry.

## Why

A tool written in Rust, Go, Zig or compiled with `bun build --compile` has
one executable per platform. Getting it onto a JavaScript developer's machine
through npm takes the same handful of pieces every time: the platform names,
two `package.json` shapes, a small Node script that finds and runs the right
executable, and a publish order that keeps the launcher from pointing at
packages that do not exist yet. Each piece has edge cases (Windows `.exe`,
Yarn Plug'n'Play, Ctrl-C delivered twice, a launcher re-raising its child's
signal). This library holds those pieces, so your release script keeps only
its build step and its names.

It is for the author of a CLI who already builds the executables, in CI or
locally, and wants npm as one more channel.

Do not use it when:

- your binary is a Node-API addon (`.node`) loaded with `require`. Use
  [`@napi-rs/cli`](https://www.npmjs.com/package/@napi-rs/cli), which builds
  platform packages for addons.
- you want one tool to own the whole release (versions, tags, every
  registry). A release orchestrator such as
  [putitoutthere](https://www.npmjs.com/package/putitoutthere) or
  [dist](https://github.com/axodotdev/cargo-dist) does that; this library is
  the npm layout only, called from a script you own.
- you would rather download the executable from a release page at install
  time (`binary-install` and similar). That needs install scripts, which many
  CI setups disable with `--ignore-scripts`; this layout does not.

## Install

```sh
npm install --save-dev @osdlc/npm-binary
```

ESM only, Node 22 or later, with types. The launcher it writes is plain
CommonJS with no dependencies and runs on Node 18 or later on the user's
machine.

## Use

Your release script builds the binaries, then writes one directory per
package and publishes them. This writes every package for a tool named
`tool`, with a stand-in for each platform's build:

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  type BinaryProduct,
  binaryPathInPackage,
  copyExecutable,
  launcherManifest,
  NPM_PLATFORMS,
  platformKey,
  platformManifest,
  renderLauncher,
  writeJson,
} from '@osdlc/npm-binary'

const product: BinaryProduct = {
  binary: 'tool', // the command on PATH
  launcher: '@acme/tool', // the package users install
  scope: '@acme', // platform packages are @acme/tool-<os>-<cpu>
  platformPrefix: 'tool',
  binaryDir: 'bin', // where the binary sits inside a platform package
}
const version = '1.0.0'
const out = mkdtempSync(join(tmpdir(), 'tool-npm-'))
const built = join(out, 'stand-in') // your build output for each platform
writeFileSync(built, '#!/bin/sh\necho hello\n')

const platformDirs = NPM_PLATFORMS.map((platform) => {
  const dir = join(out, platformKey(platform))
  mkdirSync(join(dir, 'bin'), { recursive: true })
  writeJson(
    join(dir, 'package.json'),
    platformManifest(product, platform, {
      version,
      description: `The tool binary for ${platformKey(platform)}.`,
      template: { license: 'MIT' },
    }),
  )
  copyExecutable(built, join(dir, binaryPathInPackage(product, platform)))
  return dir
})

const launcherDir = join(out, 'tool')
mkdirSync(join(launcherDir, 'bin'), { recursive: true })
writeJson(
  join(launcherDir, 'package.json'),
  launcherManifest(product, NPM_PLATFORMS, {
    version,
    description: 'The tool CLI.',
    launcherPath: 'bin/tool.js',
  }),
)
writeFileSync(join(launcherDir, 'bin', 'tool.js'), renderLauncher(product, NPM_PLATFORMS))

// Then, logged in to npm:
// await publishPackages({ platformDirs, launcherDir })
console.log(`${platformDirs.length} platform packages and the launcher in ${out}`)
```

[`examples/readme.test.ts`](examples/readme.test.ts) installs those packages
the way npm lays them out and runs the launcher.

## Guide

- [Getting started](docs/guide/getting-started.md): publish a CLI for five
  platforms, step by step, with the `package.json` files it writes.
- [How the launcher works](docs/guide/how-the-launcher-works.md): what runs on
  the user's machine, signals and exit codes.
- [Troubleshooting](docs/guide/troubleshooting.md): the errors users can hit,
  their causes and fixes.

## How the launcher behaves

`renderLauncher` returns the launcher script. On the user's machine it:

- picks the entry for `process.platform`-`process.arch`, and on a host with no
  build prints the supported platforms and exits 1;
- resolves `<platform package>/package.json`, so an `exports` map in that
  package never blocks it, and runs the binary next to it;
- explains a missing platform package: npm skips optional dependencies under
  `--omit=optional` or `--no-optional`, and when the lockfile was made on
  another platform;
- runs the binary with inherited stdio, so it owns the terminal;
- forwards SIGTERM and SIGHUP to the binary. It forwards SIGINT only when no
  standard stream is a terminal: in a terminal, Ctrl-C already reaches the
  binary through its process group, and a second copy would read as a second
  Ctrl-C. So while a standard stream is a terminal, `kill -INT <launcher pid>`
  does not reach the binary; send SIGTERM. A run in a terminal with all three
  streams redirected still gets one Ctrl-C twice, since the launcher cannot
  see its process group;
- exits with the binary's exit code. When the binary dies of a signal, it
  re-raises that signal on itself, and if Node ignores it (SIGPIPE) exits
  `128 + signal number`, as a shell does;
- with `debugEnv` set to a variable name, prints the platform, package and
  binary it resolved to stderr when that variable is set.

Every name is written into the script as a JavaScript string literal, so
quotes and backslashes in names are safe.

## API

Names and platforms:

- `BinaryProduct`: the names one product ships under (`binary`, `launcher`,
  `scope`, `platformPrefix`, `binaryDir`).
- `NpmPlatform`: an `os` (`darwin`, `linux`, `win32`) and a `cpu` (`arm64`,
  `x64`), as `process.platform` and `process.arch` name them.
- `NPM_PLATFORMS`: the default list, in publish order: `darwin-arm64`,
  `darwin-x64`, `linux-x64`, `linux-arm64`, `win32-x64`.
- `platformKey(platform)`: `darwin-arm64`.
- `platformPackageName(product, platform)`: `@acme/tool-darwin-arm64`.
- `binaryExt(platform)`: `.exe` on Windows, empty elsewhere.
- `binaryFileName(product, platform)`: `tool` or `tool.exe`.
- `binaryPathInPackage(product, platform)`: `bin/tool`, or `tool` when
  `binaryDir` is `''`.
- `findPlatform(platforms, key)`: the entry for a key; throws, naming the
  known keys, for any other.
- `hostPlatform(platforms)`: the entry for the machine this runs on.

Package shapes:

- `platformManifest(product, platform, options)`: a platform package's
  `package.json`, with `os`, `cpu`, `preferUnplugged: true` (so Yarn PnP keeps
  the binary a real file) and `files` defaulting to the binary.
- `launcherManifest(product, platforms, options)`: the launcher's
  `package.json`, with `bin`, every platform package in
  `optionalDependencies` at the same version, `files` defaulting to the
  launcher and `README.md`, and `engines.node` defaulting to `>=18`.
- `PlatformManifestOptions` and `LauncherManifestOptions`: `version`,
  `description`, the launcher's `launcherPath`, and an optional `template`
  with fields to carry (`license`, `author`, `publishConfig`, ...). Template
  fields keep their position, and the fields the library sets that the
  template does not name are appended, so your template controls the key
  order and the bytes written. `name`, `version` and `description` always
  come from the arguments; naming them in the template only fixes their
  position.
- `Manifest`: a `package.json` as a plain object.
- `writeJson(path, value)`: two-space JSON with a final newline.
- `copyExecutable(src, dest)`: copies a file and sets mode `0o755`.

The launcher:

- `renderLauncher(product, platforms, options?)`: the launcher script's
  source, described above. `LauncherOptions` has `debugEnv`.

Publishing and cargo:

- `publishPackages(options)`: `npm publish` in each platform directory, then
  the launcher's, with the npm on `PATH` and its login. It asks the registry
  first and skips every `name@version` already published, so a half-finished
  run is safe to run again. `PublishOptions` has `platformDirs`,
  `launcherDir` and `dryRun`.
- `cargoTargetDir(options)`: cargo's target directory, from
  `cargo metadata --no-deps`, for a release script that builds with cargo.
  `CargoTargetDirOptions` has `cwd`, an optional `manifestPath` for a crate
  outside the workspace at `cwd`, and a `runner` for tests.

## Platforms

The library runs anywhere Node 22 runs. The launcher it writes runs on every
platform in the list you pass. What it does not do:

- tell glibc from musl. A `linux-x64` package built against glibc fails on
  Alpine. Ship a static (musl) Linux build, or leave Linux musl out.
- fall back to an emulated build. On Windows on Arm, `process.arch` is `arm64`,
  so the launcher reports no build unless your list has `win32-arm64`, even
  though an x64 build would run under emulation.
- forward SIGHUP on Windows, which has no such signal.

The tests run on Linux and macOS. The launcher's Windows paths (`.exe`, no
SIGHUP, a signal that cannot be re-raised) are covered by unit tests, not by a
Windows run.

## Stability

Every export is stable within the 0.x line: a breaking change bumps the minor
version and is listed in the CHANGELOG. No export is experimental.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
