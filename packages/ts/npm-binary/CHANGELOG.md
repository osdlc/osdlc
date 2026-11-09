# @osdlc/npm-binary

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
