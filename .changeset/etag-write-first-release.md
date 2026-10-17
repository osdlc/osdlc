---
'@osdlc/etag-write': minor
---

The first release on npm. Version numbers before 0.2.0 were used only during development and were never published, so this entry lists everything the package does. It is the TypeScript twin of the `etag-write` Rust crate: the same write sequence, etag format and compare-and-swap rules.

- `atomicWrite(path, data, opts?)` and `atomicWriteAsync`: write a temp file beside `path`, fsync it, rename it over `path`, then fsync the directory where the platform allows it. A reader or a crash sees the old file or the new one. Parent directories are created. Any failure before the rename removes the temp file and leaves `path` as it was.
- `mode` (`AtomicWriteOptions`) sets the file's exact permission bits, whatever the umask. Without it, an overwrite keeps the old file's permission bits, less setuid, setgid and sticky, and a new file gets `0o666` less the umask.
- `etag(data)` and `etagOfFile(path)`: lowercase hex sha256. A string hashes as UTF-8. `etagOfFile` is `null` for a missing file and throws any other read error.
- `writeCas(path, data, expectedEtag, opts?)`: writes only when the file's etag matches the one sent, or the file is absent. An existing file with no etag sent is refused. It throws `WriteConflictError` with `reason` `changed` or `exists-without-etag` (`WriteConflictReason`), and returns the new etag. An unreadable file is never treated as absent.
- `writeIfChanged(path, data, opts?)`: skips the write when the bytes are the same, so mtime and file watchers are left alone. Returns whether it wrote.
- `WriteData`: `string | Uint8Array`.

Node.js 22 or later, ESM only; Bun loads the TypeScript source through the `bun` export condition. Tested on Linux and macOS. Licensed `MIT OR Apache-2.0`.
