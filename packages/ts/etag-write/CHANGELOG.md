# @osdlc/etag-write

## 0.3.0

### Minor Changes

- b835ae4: Behaviour change: when `atomicWrite` or `atomicWriteAsync` cannot create its temp file because the name is already taken, the write still fails but no longer deletes that file, which belongs to another writer.

## 0.2.1

### Patch Changes

- fb712e0: Ship the compiled `dist/` only. The `bun` export condition and the TypeScript source are no longer in the package, so Bun, Node and every bundler load the same compiled ESM and `.d.ts` files. Bun still works through the compiled `dist/`.
- fb712e0: Make every package follow the same conventions. The published manifests and READMEs change; the runtime code and the `dist/` files do not.
  
  - `author` is `sksizer` in every manifest (`@osdlc/typed-gh` had none).
  - `engines.node` is no wider than any dependency's. `@osdlc/typed-gh` and `@osdlc/code-host` now declare `^22.22.2 || ^24.15.0 || >=26.0.0`, the range of `@osdlc/typed-git` and its dependency `hosted-git-info`. `@osdlc/cli-tool` and `@osdlc/trust-repo` declare `>=22`, not `>=22.18`: a `dist/` install needs no TypeScript stripping.
  - `@osdlc/tsconfig` and `@osdlc/prettier-config` are ESM with `sideEffects: false`, and ship SECURITY.md and CONTRIBUTING.md. `@osdlc/prettier-config` has an `exports` map (`.` is `index.json`) in place of `main`.
  - Every README has `## Install` and `## Licence` sections, and every CHANGELOG starts `# @osdlc/<name>`.
  - `@osdlc/color` and `@osdlc/markdown-contract` no longer set a coverage threshold.
  - `@osdlc/yaml-splice` reaches its WebAssembly glue through a `#wasm` entry in `imports`. The shipped `dist/` files are the same.

## 0.2.0

### Minor Changes

- dbdfc67: The first release on npm. Version numbers before 0.2.0 were used only during development and were never published, so this entry lists everything the package does. It is the TypeScript twin of the `etag-write` Rust crate: the same write sequence, etag format and compare-and-swap rules.
  
  - `atomicWrite(path, data, opts?)` and `atomicWriteAsync`: write a temp file beside `path`, fsync it, rename it over `path`, then fsync the directory where the platform allows it. A reader or a crash sees the old file or the new one. Parent directories are created. Any failure before the rename removes the temp file and leaves `path` as it was.
  - `mode` (`AtomicWriteOptions`) sets the file's exact permission bits, whatever the umask. Without it, an overwrite of a regular file keeps the old file's permission bits, less setuid, setgid and sticky. A new file, or a target that is not a regular file, gets `0o666` less the umask.
  - `etag(data)` and `etagOfFile(path)`: lowercase hex sha256. A string hashes as UTF-8. `etagOfFile` is `null` for a missing file and throws any other read error.
  - `writeCas(path, data, expectedEtag, opts?)`: writes only when the file's etag matches the one sent, or the file is absent. An existing file with no etag sent is refused. It throws `WriteConflictError` with `reason` `changed` or `exists-without-etag` (`WriteConflictReason`), and returns the new etag. An unreadable file is never treated as absent.
  - `writeIfChanged(path, data, opts?)`: skips the write when the bytes are the same, so mtime and file watchers are left alone. Returns whether it wrote.
  - `WriteData`: `string | Uint8Array`.
  
  Node.js 22 or later, ESM only; Bun loads the TypeScript source through the `bun` export condition. Tested on Linux and macOS. Licensed `MIT OR Apache-2.0`.

## 0.1.0

Developed in a private repository before the package moved here. Not published.

First cut. Renamed from `@sksizer/atomic-write` to `@sksizer/etag-write`, matching the
`etag-write` crate.

### Changed

- Package renamed from `@sksizer/atomic-write`. The `atomicWrite` and `atomicWriteAsync`
  names stay.

### Added

- `atomicWrite` and `atomicWriteAsync`: temp file beside the target, fsync, rename,
  best-effort directory fsync, temp file removed on failure. A `mode` option sets the file's
  exact permissions.
- `etag` and `etagOfFile`: lowercase hex sha256, matching the Rust crate.
- `writeCas`: compare-and-swap under the crate's contract table, failing with
  `WriteConflictError` (`changed` or `exists-without-etag`).
- `writeIfChanged`: skips a write whose content is already on disk.
