# @osdlc/etag-write

Atomic file writes, sha256 etags and compare-and-swap for Node.js. No
dependencies beyond Node's own `fs` and `crypto`.

## Why

`writeFileSync` truncates the file and then writes it. A reader that opens the
file in between can see a truncated file, and a crash in between can leave one
on disk. When a person and a program edit the same file, a program that writes
without checking can also throw away whatever the person saved since the
program read it.

It is for programs that rewrite files that people or other programs also edit:
notes, config files, state files.

When not to use it:

- You need a lock, or several files changed together as one transaction.
- The file is on a network file system where `rename` is not atomic.
- The file is large and rewritten often. Every write copies the whole file
  and hashes it.
- You only need atomic replace with no etag check. `write-file-atomic` or
  `atomically` do that, with more options.

## Install

```sh
npm install @osdlc/etag-write
```

ESM only. Node.js 22 or later. Bun also works.

## Quick start

```ts
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { atomicWrite, etagOfFile, WriteConflictError, writeCas } from '@osdlc/etag-write'

const dir = mkdtempSync(join(tmpdir(), 'etag-write-'))
const path = join(dir, 'note.md')

// A reader or a crash sees the old file or the new one, never half of either.
atomicWrite(path, 'first draft\n')

// Read the etag, then write with it.
const seen = etagOfFile(path) // null when the file does not exist
writeCas(path, 'second draft\n', seen)

// Writing again with the old etag is refused: the file changed.
try {
  writeCas(path, 'stale edit\n', seen)
} catch (err) {
  if (!(err instanceof WriteConflictError)) throw err
  // err.reason is 'changed': re-read, merge, try again.
}
```

## What a write does

`atomicWrite(path, data, { mode? })` creates the parent directories, writes
`data` to a uniquely named temp file beside `path`, fsyncs it, renames it over
`path`, then fsyncs the directory where the platform allows it. The temp file
sits in the same directory because a rename across file systems is not atomic.
Its name is unique per write, so concurrent writers never share one. Any
failure before the rename removes the temp file, leaves `path` as it was, and
rethrows the error. Parent directories the write created stay.

`atomicWriteAsync` is the same write over `fs/promises`.

## The compare-and-swap rules

`writeCas(path, data, expectedEtag)` takes the etag of the content the caller
read, or `null` when it read nothing, and returns the new etag:

| on disk | etag sent | result |
|---|---|---|
| exists | matches | write |
| exists | differs | `WriteConflictError`, reason `changed` |
| exists | none | `WriteConflictError`, reason `exists-without-etag` |
| absent | none | create |
| absent | some | create (the file was deleted since it was read) |
| unreadable | any | the read error is thrown; never treated as absent |

The third row is the one that matters: no etag on an existing file is a blind
write, and blind writes lose data.

## The rest

- `etag(data)`: lowercase hex sha256. A string hashes as UTF-8.
- `etagOfFile(path)`: the etag of a file, or `null` when it does not exist.
  Any other read error throws.
- `writeIfChanged(path, data)`: writes only when the bytes differ, so an
  identical write leaves mtime alone and wakes no file watcher. Returns
  whether it wrote.
- The types `WriteData`, `AtomicWriteOptions` and `WriteConflictReason`.

## Behaviour to know

- **Permissions.** `mode` sets the file's exact permission bits, whatever the
  umask. Without it, an overwrite keeps the old file's permission bits, and a
  new file gets the mode `writeFileSync` would give it: `0o666` less the
  umask. An overwrite without `mode` drops the setuid, setgid and sticky bits,
  because the new file has a new owner. Owner and group are not copied. A
  target that is not a regular file, or cannot be stat'ed, gets a new file's
  mode. The old bits are read before the temp file is written, so a `chmod` of
  the target between that read and the rename is lost.
- **Symlinks.** The rename replaces a symlink at `path` with a regular file. It
  does not write through the link. The new file takes the mode of the file the
  link pointed to.
- **Temp files** are named `.<name>.<12 hex digits>.tmp` in the target's
  directory. A crash between the write and the rename can leave one behind.
- **The check and the write are not one step.** `writeCas` reads, compares and
  then renames. Another writer that lands in that short window is not
  detected. This narrows the race but does not close it. It is not a lock.
- **Durability.** The temp file is fsynced before the rename and the directory
  after it. That the bytes survive a power cut depends on the operating system
  and the disk honouring fsync. No test covers it. A directory fsync that the
  platform refuses is skipped.

## How it compares

| | `@osdlc/etag-write` | `write-file-atomic` | `atomically` |
|---|---|---|---|
| Atomic replace via temp file and rename | yes | yes | yes |
| Etag of a file (sha256) | yes | no | no |
| Refuses a write if the file changed since it was read | yes | no | no |
| Skips a write of identical bytes | yes | no | no |
| Sets owner and group | no | yes | yes |

This comparison is from each package's documentation. Pick one of the others
when you only need atomic replace or need to set the owner. Pick this package
when more than one writer edits the same file and a lost update matters.

The `etag-write` Rust crate is this package's twin: the same write sequence,
etag format and compare-and-swap rules. `atomicWriteAsync` and the `mode`
option exist only here.

## Stability

The package is 0.x, so any minor release may break the API. Within that, each
export is stable or experimental. A breaking change to a stable export is
listed in the CHANGELOG under "Breaking". Any release may change or remove an
experimental export.

The experimental exports:

- none

## Runtimes and platforms

Node.js 22 or later, ESM only. Bun works too, and loads the TypeScript source
through the `bun` export condition. The tests run on Linux and macOS. Windows
is not tested: the code has no Windows-specific path, the permission tests are
skipped there, and a rename over a file that another process holds open can
fail on Windows.

## License

`MIT OR Apache-2.0`, at your option.
