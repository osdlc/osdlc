---
"@osdlc/npm-binary": patch
---

The first release of `@osdlc/npm-binary` on npm. It ships a compiled binary through npm as one launcher package plus one `os`/`cpu`-gated package per platform, which npm picks through `optionalDependencies`.

- Platform names: `platformKey`, `platformPackageName`, `binaryExt`, `binaryFileName`, `binaryPathInPackage`, `findPlatform`, `hostPlatform` and `NPM_PLATFORMS`.
- `platformManifest` and `launcherManifest` write the two `package.json` shapes. A `template` carries shared fields in the order you give them; `name`, `version` and `description` always come from the arguments; each package's `files` always includes its binary or launcher. `writeJson` and `copyExecutable` write them out.
- `renderLauncher` writes a CommonJS launcher with no dependencies, for Node 18 or later. It runs the binary for the host with inherited stdio, forwards SIGTERM and SIGHUP, re-raises the binary's signal or exits `128 + signal`, and explains a missing or unsupported platform. It forwards SIGINT only when no standard stream is a terminal, so one Ctrl-C reaches the binary once. While a standard stream is a terminal, a SIGINT sent to the launcher's pid alone does not reach the binary; stop it with SIGTERM.
- `publishPackages` publishes the platform packages first and the launcher last, skips versions already on the registry, and stops before publishing anything when it cannot tell what is there. `viewRunner` and `publishRunner` replace `npm` in tests.
- `cargoTargetDir` asks cargo for its target directory.
- ESM only, compiled JavaScript with `.d.ts`, Node 22 or newer. Licence `MIT OR Apache-2.0`.
