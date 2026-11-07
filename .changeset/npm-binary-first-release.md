---
'@osdlc/npm-binary': patch
---

The first release of `@osdlc/npm-binary` on npm. It ships a compiled binary through npm as one launcher package plus one `os`/`cpu`-gated package per platform, which npm picks through `optionalDependencies`.

- Platform names (`platformKey`, `platformPackageName`, `binaryFileName`, `binaryPathInPackage`, `findPlatform`, `hostPlatform`, `NPM_PLATFORMS`), the two `package.json` shapes (`platformManifest`, `launcherManifest`), `renderLauncher`, `publishPackages`, `cargoTargetDir`, `writeJson` and `copyExecutable`.
- The launcher no longer forwards SIGINT while stdin, stdout or stderr is a terminal, so one Ctrl-C reaches the binary once, not twice (`echo x | tool` included). While a standard stream is a terminal, a `kill -INT` sent to the launcher alone no longer reaches the binary; send SIGTERM, which is always forwarded.
- Names with quotes or backslashes are written into the launcher correctly. Before, a backslash was decoded twice and a single quote broke the script.
- A template's `name`, `version` or `description` keeps its position but no longer overrides the arguments.
- `cargoTargetDir` throws when cargo's output has no `target_directory`, instead of returning `undefined`.
- `publishPackages` takes `viewRunner` and `publishRunner`, so a test can run it without npm.
- ESM only, compiled JavaScript with `.d.ts`, Node 22 or newer. The launcher it writes is CommonJS with no dependencies and runs on Node 18 or newer. Licence `MIT OR Apache-2.0`.
