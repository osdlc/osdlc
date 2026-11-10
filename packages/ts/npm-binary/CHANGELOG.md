# @osdlc/npm-binary

## 0.1.2

### Patch Changes

- Updated dependencies [e1a5941]
  - @osdlc/command-seam@0.15.0

## 0.1.1

### Patch Changes

- f30e5a1: The first release of `@osdlc/npm-binary` on npm. It ships a compiled binary through npm as one launcher package plus one `os`/`cpu`-gated package per platform, which npm picks through `optionalDependencies`.
  
  - Platform names: `platformKey`, `platformPackageName`, `binaryExt`, `binaryFileName`, `binaryPathInPackage`, `findPlatform`, `hostPlatform` and `NPM_PLATFORMS`. Any `process.platform`/`process.arch` pair can be a platform, and an empty `platformPrefix` gives esbuild-style names (`@scope/linux-x64`).
  - `platformManifest` and `launcherManifest` write the two `package.json` shapes. A `template` carries shared fields in the order you give them; `name`, `version` and `description` always come from the arguments; each package's `files` always covers its binary or launcher. `writeJson` and `copyExecutable` write them out.
  - `renderLauncher` writes a CommonJS launcher with no dependencies, for Node 18 or later. It runs the binary for the host with inherited stdio, forwards SIGTERM and SIGHUP, re-raises the binary's signal or exits `128 + signal`, and explains a missing or unsupported platform. It forwards SIGINT only when no standard stream is a terminal, and never on Windows, so one Ctrl-C reaches the binary once. Its handlers are in place before the binary starts, so a signal at startup is never lost. While a standard stream is a terminal, a SIGINT sent to the launcher's pid alone does not reach the binary; stop it with SIGTERM.
  - `publishPackages` publishes the platform packages first and the launcher last, skips versions already on the registry, stops before publishing anything when it cannot tell what is there, and returns the `published` and `skipped` packages. `viewRunner` and `publishRunner` replace `npm` in tests.
  - `cargoTargetDir` asks cargo for its target directory.
  - ESM only, compiled JavaScript with `.d.ts`, Node 22 or newer. Licence `MIT OR Apache-2.0`.

## History before the first public release

These versions were never published. The first release of `@osdlc/npm-binary`
on npm is 0.1.1, and the entry for it is added above this section when it is
released.

### [0.1.0] - 2026-10-06 (unpublished)

#### Added

- Ship a compiled binary through npm as one launcher package plus one
  `os`/`cpu`-gated package per platform.
- Platform helpers: `platformKey`, `platformPackageName`, `binaryExt`,
  `binaryFileName`, `binaryPathInPackage`, `findPlatform`, `hostPlatform`,
  `NPM_PLATFORMS`.
- `platformManifest` and `launcherManifest` package.json builders, which keep
  a product's template key order; `writeJson` and `copyExecutable`.
- `renderLauncher`: a Node launcher shim that resolves the platform package,
  runs the binary with inherited stdio, forwards signals to it and re-raises
  the binary's signal or exits `128 + signal`.
- `publishPackages`: platform packages first, the launcher last, skipping
  versions already published.
- `cargoTargetDir`: cargo's target directory from `cargo metadata`.
