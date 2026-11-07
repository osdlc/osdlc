---
title: Troubleshooting
sidebar:
  order: 3
description: The errors users can hit with a launcher-plus-platform-packages tool, their causes and fixes.
---

Each section starts with what the user sees. Most problems come from the
platform package not being installed, because npm treats it as optional.

## "the platform package ... is not installed"

```text
mytool: the platform package @mytool/cli-linux-x64 is not installed. ...
```

npm did not install the package for this machine. The usual causes:

| Cause                                                                                                | Fix                                                                         |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Optional dependencies are turned off: `npm install --omit=optional`, `--no-optional`, or `omit=optional` in `.npmrc`. | Install without that flag, or add `@mytool/cli-linux-x64` as a regular dependency. |
| The lockfile was made on another platform, for example on a Mac, and then `npm ci` ran in Linux Docker. Some npm versions write a lockfile that lacks the other platforms' optional packages. | Delete `node_modules` and the lockfile and install again, or update npm. Adding the Linux package as a dependency also works. |
| `node_modules` was copied from another machine, for example into a Docker image.                     | Run the install inside the image, not on the host.                         |
| The launcher was installed from a folder (`npm install ./some/dir`), so npm linked it instead of copying it. | Install the packed `.tgz` instead. See [Getting started](getting-started.md#6-try-it-before-you-publish). |

## "has no build for ..."

```text
mytool has no build for win32-arm64. Supported: darwin-arm64, darwin-x64, linux-x64, linux-arm64, win32-x64.
```

The tool does not ship a package for this platform. Two common cases:

- **Windows on Arm.** Node reports `arm64`, so the launcher looks for
  `win32-arm64`. An x64 build would run under emulation, but the launcher does
  not fall back to it. Users can work around it with an x64 build of Node,
  which reports `x64`. As the author, add `{ os: 'win32', cpu: 'arm64' }` to
  your platform list and build for it.
- **A platform you never targeted**, such as FreeBSD. Add it to the list if
  you can build for it.

To ship for more platforms, pass your own list instead of `NPM_PLATFORMS`, the
same list to every call:

```ts
import { NPM_PLATFORMS, type NpmPlatform } from '@osdlc/npm-binary'

const PLATFORMS: NpmPlatform[] = [...NPM_PLATFORMS, { os: 'win32', cpu: 'arm64' }]
```

`NpmPlatform` covers `darwin`, `linux` and `win32` on `arm64` and `x64`.

## The binary fails on Alpine Linux

On Alpine (and other musl-based Linux), a binary built against glibc fails
with a message like `not found` or `Error loading shared library`, even though
the file is there.

npm sees platforms only by `os` and `cpu`. It cannot tell glibc Linux from
musl Linux, so the same `linux-x64` package installs on both. Build the Linux
binaries statically against musl (for Rust, the
`x86_64-unknown-linux-musl` and `aarch64-unknown-linux-musl` targets): a
static musl binary runs on both.

## "is installed but its binary ... is missing"

The platform package is there but the file is not. Either the package was
published without it (check `files` in the platform package's `package.json`,
and that `copyExecutable` ran before publishing), or something deleted it.
Reinstalling fixes the second case.

## "could not run ...: EACCES"

The binary lost its executable bit. Packages built with `copyExecutable` set
mode `755`. Make sure nothing after it (an archive step, a copy that drops
modes) clears it. Check with `tar -tvzf` on the packed `.tgz`: the binary
should show `-rwxr-xr-x`.

## Yarn Plug'n'Play: the binary cannot be run

Plug'n'Play keeps packages inside zip archives, and a file inside a zip
cannot be run. Platform packages set `preferUnplugged: true`, which tells
Yarn to extract them. If you replace the manifest by hand, keep that field.

## Ctrl-C needs pressing twice, or stops the tool too hard

The launcher forwards SIGINT only when no standard stream is a terminal; see
[How the launcher works](how-the-launcher-works.md#signals). If your tool still
sees two SIGINTs, check that the user did not redirect all three streams while
running it in a terminal. That one case the launcher cannot detect.

## A release failed halfway

Run the same `publishPackages` call again. It asks the registry which
`name@version` pairs already exist and skips them, so it publishes only what
is missing. The launcher always goes last, so users never install a launcher
whose platform packages are not on the registry yet.

## Seeing what the launcher picked

Render the launcher with `debugEnv` and set that variable:

```sh
MYTOOL_DEBUG=1 mytool --version
```

It prints the platform key, the package and the full binary path to stderr
before running the binary.
