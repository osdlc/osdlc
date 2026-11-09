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
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
      // Platform packages are scoped, and npm publishes a new scoped package
      // as private unless publishConfig.access says public.
      template: { license: 'MIT', publishConfig: { access: 'public' } },
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
rmSync(out, { recursive: true, force: true })
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

`renderLauncher` returns the launcher script. On the user's machine it finds
the platform package npm installed for that host, runs its binary with the
same arguments and the terminal, passes signals through, and exits with the
binary's exit code. A host with no build, or a missing platform package, gets
an error that names the cause. Every name is written into the script as a
JavaScript string literal, so quotes and backslashes in names are safe.

[How the launcher works](docs/guide/how-the-launcher-works.md) has the
details: the lookup, when Ctrl-C is and is not forwarded, and the exit codes.

## API

Names and platforms:

- `BinaryProduct`: the names one product ships under (`binary`, `launcher`,
  `scope`, `platformPrefix`, `binaryDir`).
- `NpmPlatform`: an `os` and a `cpu`, as `process.platform` and
  `process.arch` name them. Any value Node reports is accepted; `darwin`,
  `linux`, `win32`, `arm64` and `x64` are named for completion.
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
  the binary a real file) and `files` defaulting to the binary (a
  template's `files` gets the binary added).
- `launcherManifest(product, platforms, options)`: the launcher's
  `package.json`, with `bin`, every platform package in
  `optionalDependencies` at the same version, `files` defaulting to the
  launcher and `README.md` (a template's `files` gets the launcher added),
  and `engines.node` defaulting to `>=18`. A launcher template with
  `"type": "module"` is refused: the launcher is CommonJS.
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
  `launcherDir`, `dryRun`, and `viewRunner` and `publishRunner` to replace the
  `npm` it runs (for tests). It returns a `PublishResult`: the `published` and
  `skipped` packages as `name@version`.
- `cargoTargetDir(options)`: cargo's target directory, from
  `cargo metadata --no-deps`, for a release script that builds with cargo.
  `CargoTargetDirOptions` has `cwd`, an optional `manifestPath` for a crate
  outside the workspace at `cwd`, and a `runner` for tests.

## Platforms

The library runs anywhere Node 22 runs. The launcher it writes runs on every
platform in the list you pass. What it does not do:

- tell glibc from musl. It sets no `libc` field, so one `linux-x64` package
  installs on glibc and musl (Alpine) hosts alike, and a glibc build fails on
  Alpine. Ship a static (musl) Linux build.
- fall back to an emulated build. On Windows on Arm, `process.arch` is `arm64`,
  so the launcher reports no build unless your list has `win32-arm64`, even
  though an x64 build would run under emulation.
- forward SIGHUP on Windows. Node raises it there when the console window
  closes, and the binary gets that close event itself.
- forward SIGINT on Windows. The binary gets the console's Ctrl-C itself,
  and Node's `kill` on Windows is a hard kill rather than a signal.

The tests run on Linux and macOS. The launcher's Windows paths (`.exe`, no
SIGHUP, no SIGINT forwarding, a signal that cannot be re-raised) are covered
by unit tests, not by a Windows run.

## Stability

Every export is stable within the 0.x line: a breaking change bumps the minor
version and is listed in the CHANGELOG. No export is experimental.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
