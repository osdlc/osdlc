---
title: Getting started
sidebar:
  order: 1
description: Publish a compiled CLI to npm so `npx your-tool` runs a native binary.
---

You have a command-line tool compiled to a native executable: Rust, Go, Zig,
or a `bun build --compile` bundle. You want people to run it with

```sh
npx mytool --help
# or
npm install -g mytool
```

and get the native binary for their machine. They should not need a compiler,
an install script, or a download from anywhere but the npm registry.

This page walks through publishing one tool, `mytool`, for five platforms.

## The idea in one picture

You publish six packages for each version:

```text
mytool                     ← users install this one: a small Node launcher
├─ @mytool/cli-darwin-arm64   macOS, Apple silicon   ┐
├─ @mytool/cli-darwin-x64     macOS, Intel           │ one native binary each,
├─ @mytool/cli-linux-x64      Linux, x64             │ marked with "os" and "cpu"
├─ @mytool/cli-linux-arm64    Linux, arm64           │
└─ @mytool/cli-win32-x64      Windows, x64           ┘
```

The launcher lists the five platform packages as `optionalDependencies`. Each
platform package says which `os` and `cpu` it is for, and npm skips any
optional dependency that does not match the machine. So on a Linux x64 laptop,
`npm install mytool` downloads the launcher and `@mytool/cli-linux-x64`, and
nothing else.

When the user runs `mytool`, Node starts the launcher. It finds the platform
package that npm installed, runs its binary with the same arguments, and exits
with the binary's exit code. esbuild, Biome, SWC and Turborepo ship this way.

`@osdlc/npm-binary` writes those six packages for you and publishes them in a
safe order. Your release script still builds the binaries; the library takes
over from there.

## 1. Describe your product

Everything starts from a `BinaryProduct`: the names your tool ships under.

```ts
import type { BinaryProduct } from '@osdlc/npm-binary'

const product: BinaryProduct = {
  binary: 'mytool', // the command users type, and the file name of the binary
  launcher: 'mytool', // the package users install
  scope: '@mytool', // platform packages live under this npm scope...
  platformPrefix: 'cli', // ...named @mytool/cli-<os>-<cpu>
  binaryDir: 'bin', // the binary sits at bin/mytool inside each platform package
}
```

The launcher can be scoped or not. Platform packages are always scoped, so you
need an npm organisation (here `@mytool`) that you can publish to.

The names derive from it. With
`const linux = findPlatform(NPM_PLATFORMS, 'linux-x64')` and
`const windows = findPlatform(NPM_PLATFORMS, 'win32-x64')`:

| Call                                        | Result                  |
| ------------------------------------------- | ----------------------- |
| `platformKey(linux)`                        | `linux-x64`             |
| `platformPackageName(product, linux)`       | `@mytool/cli-linux-x64` |
| `binaryFileName(product, windows)`          | `mytool.exe`            |
| `binaryPathInPackage(product, windows)`     | `bin/mytool.exe`        |

Set `platformPrefix: ''` for esbuild-style names: `@mytool/linux-x64`.

`NPM_PLATFORMS` is the default list of five. Pass your own list everywhere if
you ship for more or fewer, for example with `{ os: 'win32', cpu: 'arm64' }`
or `{ os: 'freebsd', cpu: 'x64' }` added: any `process.platform` and
`process.arch` value works.

## 2. Build the binaries

This part is yours. Build one executable per platform and put them somewhere
your script can find them. With cargo and cross-compilation, for example:

```text
target/aarch64-apple-darwin/release/mytool
target/x86_64-apple-darwin/release/mytool
target/x86_64-unknown-linux-musl/release/mytool
target/aarch64-unknown-linux-musl/release/mytool
target/x86_64-pc-windows-msvc/release/mytool.exe
```

Build Linux binaries against musl (statically linked) if you can. The
platform packages carry no `libc` field, so one `linux-x64` package installs on
glibc Linux and musl Linux (Alpine) alike, and has to run on both. See [Troubleshooting](troubleshooting.md).

If your script needs to know where cargo puts its output, ask cargo:

```ts
import { cargoTargetDir } from '@osdlc/npm-binary'

const target = cargoTargetDir({ cwd: process.cwd() }) // e.g. /work/mytool/target
```

This runs `cargo metadata`, so it is right inside a cargo workspace and with
`CARGO_TARGET_DIR` set, where guessing `./target` is not.

## 3. Write the platform packages

One directory per platform, each with a `package.json` and the binary:

```ts
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import {
  binaryFileName,
  binaryPathInPackage,
  copyExecutable,
  NPM_PLATFORMS,
  platformKey,
  platformManifest,
  writeJson,
} from '@osdlc/npm-binary'

const version = '1.2.0'
// Fields every package gets. Platform packages are scoped, and npm publishes a
// new scoped package as private unless publishConfig.access says public.
const template = {
  license: 'MIT',
  repository: 'github:you/mytool',
  publishConfig: { access: 'public' },
}
const RUST_TARGET: Record<string, string> = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-musl',
  'linux-arm64': 'aarch64-unknown-linux-musl',
  'win32-x64': 'x86_64-pc-windows-msvc',
}

const platformDirs = NPM_PLATFORMS.map((platform) => {
  const key = platformKey(platform)
  const dir = join('dist-npm', key)
  mkdirSync(join(dir, 'bin'), { recursive: true })

  writeJson(
    join(dir, 'package.json'),
    platformManifest(product, platform, {
      version,
      description: `The mytool binary for ${key}. Install "mytool" instead.`,
      template,
    }),
  )

  const triple = RUST_TARGET[key]
  if (triple === undefined) throw new Error(`no Rust target for ${key}`)
  copyExecutable(
    join('target', triple, 'release', binaryFileName(product, platform)),
    join(dir, binaryPathInPackage(product, platform)),
  )
  return dir
})
```

`dist-npm/linux-x64/package.json` comes out as:

```json
{
  "name": "@mytool/cli-linux-x64",
  "version": "1.2.0",
  "description": "The mytool binary for linux-x64. Install \"mytool\" instead.",
  "license": "MIT",
  "repository": "github:you/mytool",
  "os": ["linux"],
  "cpu": ["x64"],
  "files": ["bin/mytool"],
  "preferUnplugged": true
}
```

- `os` and `cpu` are what make npm skip it on other machines.
- `files` ships only the binary. Set `files` in the template to ship more,
  such as a README or a licence file; the binary is added to that list if it
  is missing, so one template can serve every package.
- `preferUnplugged` makes Yarn Plug'n'Play extract the binary to a real file,
  so it can be run.
- `copyExecutable` copies the file and sets mode `755`. Without the executable
  bit, the binary cannot be run on macOS and Linux.

### The template

`template` holds the fields you want in every package: `license`, `author`,
`repository`, `homepage`, `keywords`, `publishConfig`. Its keys keep the order
you wrote them in, and the library appends the keys it adds. So the files come
out byte-for-byte the same on every release, and a diff between two releases
shows only what changed.

The library always sets `name`, `version` and `description` from your
arguments, even if the template has them. That way a stale `"version"` left in
a template file never gets published.

## 4. Write the launcher package

```ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { launcherManifest, NPM_PLATFORMS, renderLauncher, writeJson } from '@osdlc/npm-binary'

const launcherDir = join('dist-npm', 'mytool')
mkdirSync(join(launcherDir, 'bin'), { recursive: true })

writeJson(
  join(launcherDir, 'package.json'),
  launcherManifest(product, NPM_PLATFORMS, {
    version,
    description: 'A fast tool.',
    launcherPath: 'bin/mytool.js',
    template,
  }),
)
writeFileSync(
  join(launcherDir, 'bin', 'mytool.js'),
  renderLauncher(product, NPM_PLATFORMS, { debugEnv: 'MYTOOL_DEBUG' }),
)
// Also write a README.md for the npm page; `files` includes it by default.
```

The launcher's `package.json`:

```json
{
  "name": "mytool",
  "version": "1.2.0",
  "description": "A fast tool.",
  "license": "MIT",
  "repository": "github:you/mytool",
  "bin": { "mytool": "bin/mytool.js" },
  "files": ["bin/mytool.js", "README.md"],
  "optionalDependencies": {
    "@mytool/cli-darwin-arm64": "1.2.0",
    "@mytool/cli-darwin-x64": "1.2.0",
    "@mytool/cli-linux-x64": "1.2.0",
    "@mytool/cli-linux-arm64": "1.2.0",
    "@mytool/cli-win32-x64": "1.2.0"
  },
  "engines": { "node": ">=18" }
}
```

Every platform package is pinned to exactly the launcher's version, so a user
never gets a launcher from one release and a binary from another.

`renderLauncher` returns the script for `bin/mytool.js`. It is plain CommonJS
with no dependencies, because it runs on the user's machine before anything
else is available. [How the launcher works](how-the-launcher-works.md) says
what it does.

## 5. Publish

```ts
import { publishPackages } from '@osdlc/npm-binary'

await publishPackages({ platformDirs, launcherDir })
```

This runs `npm publish` in each directory: the five platform packages first,
the launcher last. If the launcher went first, someone who installed it in the
next few seconds would get a launcher whose binaries do not exist yet.

Before publishing anything, it asks the registry which `name@version` pairs
are already there and skips them. If a run fails halfway (a network error
after three platform packages, say), run the same command again: it publishes
the rest. If that check itself fails for any reason other than "not found"
(no network, not logged in), it stops before publishing anything.

It uses the `npm` on your `PATH`, logged in as you are. Registry, access and
tag settings come from npm's own config and each package's `publishConfig`;
the check asks the same `publishConfig.registry` that `npm publish` will use.
`dryRun: true` passes `--dry-run`, so you can see what would be published.

### Prereleases

npm publishes every version under the `latest` tag unless told otherwise, and
recent npm versions refuse a prerelease such as `1.3.0-beta.1` without a tag.
Set the tag in the template for that release:

```ts
const template = { license: 'MIT', publishConfig: { access: 'public', tag: 'next' } }
```

Users then get it with `npm install mytool@next`, and `npm install mytool`
keeps installing the latest stable version.

### Publishing from CI with provenance

To publish from GitHub Actions with
[npm provenance](https://docs.npmjs.com/generating-provenance-statements), put
it in the template so every package carries it:

```ts
const template = {
  license: 'MIT',
  repository: 'github:you/mytool',
  publishConfig: { access: 'public', provenance: true },
}
```

and give the publishing job `permissions: id-token: write`.

To publish from CI with no npm token at all, use npm's
[trusted publishing](https://docs.npmjs.com/trusted-publishers). npm can only
trust a workflow for a package that already exists, so the very first version
of each of the six packages is published by hand, then each one gets the
workflow as its trusted publisher.

## 6. Try it before you publish

Pack the launcher and your machine's platform package, install the tarballs
into an empty project, and run the command:

```sh
npm pack ./dist-npm/mytool ./dist-npm/linux-x64 --pack-destination /tmp/try-pkgs
mkdir /tmp/try && cd /tmp/try && npm init -y
npm install /tmp/try-pkgs/*.tgz
npx mytool --version
MYTOOL_DEBUG=1 npx mytool --version   # also prints which binary it ran
```

Replace `linux-x64` with your machine's platform key. Install the tarballs,
not the directories: npm links a directory instead of copying it, and from
the linked location the launcher cannot find its platform package.
