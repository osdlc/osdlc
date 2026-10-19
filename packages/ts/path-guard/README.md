# @osdlc/path-guard

Join an untrusted, root-relative path onto a root and prove it cannot escape.

## The problem

A path from a client, a config file or a shell cannot be trusted.
`join(root, input)` can walk out of the root with `..`, an absolute path, a `~`,
a Windows drive, or a symlink whose target leaves the root although its spelling
never says `..`. A substring check such as `!p.includes('..')` is weak both ways.
It rejects innocent names (`My ..dotfiles note.md`) and misses the symlink
escape.

`@osdlc/path-guard` is for a server or tool that stores files under one root and
must keep every request inside it. Use it wherever a path from outside is joined
onto a root. It has no dependencies. The
[Rust crate `path-guard`](https://crates.io/crates/path-guard) is its twin.

## When not to use it

- To check a path that may pass through a symlink with `isInside`. It compares
  text only and follows no symlink, so a link inside the root that points out of
  it passes. Use `resolveInside`, or `realPathInside` for a path that exists.
- As a sandbox or a lock. The check is a snapshot (see
  [How it works](#how-it-works)), and it does not restrict what your own
  process may open.
- To stop a hard link to a file outside the root. No path check can.
- When you need only the text check. `is-path-inside` is smaller.

## How it compares

| Package | What it gives |
|---|---|
| [is-path-inside](https://github.com/sindresorhus/is-path-inside) | Whether one path is inside another, by text. It does not check that paths exist and does not resolve symlinks. |
| [path-is-inside](https://github.com/domenic/path-is-inside) | The same text-only check, with Windows case rules. |
| [resolve-path](https://github.com/pillarjs/resolve-path) | Resolves a relative path against a root and throws when the result looks malicious: an absolute path, a NUL byte, a path outside the root. Its README does not mention symlinks. |
| [@openclaw/fs-safe](https://github.com/openclaw/fs-safe) | A root handle whose file operations are confined to a directory, with reads, writes, archive extraction and directory walking. A larger package, with native helpers. |

`@osdlc/path-guard` pairs a lexical check with a symlink-aware proof that works
for paths that do not exist yet, takes any filesystem through a `Resolver`, and
shares one test fixture with a Rust twin. If you need only one of those halves,
a smaller package may fit better.

## Install

```sh
npm install @osdlc/path-guard
```

## Quick start

```ts
import { PathError, resolveInside } from '@osdlc/path-guard'

resolveInside('/srv/data', 'notes/a.md')
// /srv/data/notes/a.md

try {
  resolveInside('/srv/data', '../etc/passwd')
} catch (e) {
  if (e instanceof PathError) e.kind
  // parent_segment
}
```

`examples/usage.test.ts` runs every export of this package.

## How it works

Two layers, both mandatory:

1. **Lexical**: `validateRelative` rejects empty paths, NUL bytes, a leading
   `~`, Windows drive and UNC prefixes, absolute paths, and `.`, `..` or empty
   segments, without touching the filesystem. It returns the normalised form:
   backslashes folded to `/`, no trailing slash. A name that only contains dots
   (`My ..dotfiles note.md`) is accepted.
2. **Containment**: `resolveInside` joins a validated path onto a root and
   proves the result stays inside it. It resolves symlinks in whatever part of
   the path exists, so a symlink out of the root is refused, and a path that does
   not exist yet can still be checked. The root need not exist either. A
   dangling symlink is followed to where its target would be created, so a link
   to a missing file outside the root is refused too. A chain of more than
   `MAX_LINK_HOPS` (40) links is refused. `tryResolveInside` is the same check
   returning null instead of throwing. `contains` answers the same question for
   two absolute paths.

A refusal throws a `PathError`. Its `kind` is one of `empty`, `nul`, `tilde`,
`windows_path`, `absolute`, `parent_segment`, `degenerate_segment` or
`escapes`, and `PathErrorKind` is that union.

The check is a snapshot. A symlink planted or changed after `resolveInside`
returns is not seen. To create a file, open it with `fs.open(path, 'wx')`. That
open fails when the final component is a symlink, dangling or not. A symlink
swapped into a parent directory still needs a per-component no-follow open,
which Node does not have.

The containment layer reads the filesystem through a `Resolver`, which answers
`realpath` and `readlink`. `nodeResolver` is the default. Pass another, such as
an in-memory table, as the last argument of `resolveInside`, `tryResolveInside`,
`contains` or `canonicalExistingPrefix`. A table must also hold every ancestor
of each entry, as the `Resolver` TSDoc requires. A table of leaf entries gives
wrong answers with no error.

`canonicalExistingPrefix` gives the real path of the part of a path that exists
and keeps the rest as written, with any `..` folded against the real path.
`realpathOrSelf` is the same for the real filesystem, after it makes the path
absolute against the working directory.

Two helpers work on text alone and touch no filesystem. `lexicalAbsolute` makes a
path absolute against the working directory, then drops `.` and removes each `..`
with the component before it. It follows no symlink, so it says nothing about
containment. `toRelative(root, abs)` turns an absolute path under `root` back into
a root-relative one with `/` separators. It throws a `PathError` of kind `escapes`
when `abs` is not under `root`, and `parent_segment` when the relative part holds
a `..`.

## Reading a file inside a root

A check followed by a read leaves a window: the file or a parent directory can
be swapped for a symlink in between. `openContainedFile(realRoot, path)` checks,
opens, then resolves the path again. It accepts the handle only when it is the
file found at that real path, with the same device and inode. The open is
non-blocking, so a FIFO cannot hang the call. The handle can still be a
directory or another file that is not a regular file, so check `stats.isFile()`
before you read. The caller closes the handle.

`readContainedFile` does that: it reads through `openContainedFile` and returns
null for anything that is not a regular file.

`realPathInside(realRoot, path)` and `existingPathInside(root, realRoot, path)`
resolve an existing path and check it against a root. `isInside(root, path)` is
the lexical check alone.

## The API

| Export | Kind | What it is |
|---|---|---|
| `validateRelative` | function | Layer 1. Returns the normalised form of a root-relative path, or throws `PathError`. |
| `PathError` | class | The error every refusal throws. Its `kind` says why. |
| `PathErrorKind` | type | The eight values `kind` takes. |
| `resolveInside` | function | Layers 1 and 2. Returns the joined path or throws `PathError`. |
| `tryResolveInside` | function | `resolveInside` that returns null instead of throwing. |
| `contains` | function | Is `inner` the same as `outer`, or beneath it, once both are resolved? |
| `canonicalExistingPrefix` | function | The real path of the part that exists, plus the rest as written. |
| `realpathOrSelf` | function | `canonicalExistingPrefix` of an absolute path, on the real filesystem. |
| `lexicalAbsolute` | function | A path made absolute against the working directory and folded as text. Follows no symlink. |
| `toRelative` | function | An absolute path under a root, as a root-relative path with `/` separators, or throws `PathError`. |
| `Resolver` | type | `realpath` and `readlink`: how the containment layer reads a filesystem. |
| `nodeResolver` | object | The real filesystem, with `..` resolved physically. |
| `MAX_LINK_HOPS` | constant | The number of dangling symlinks one check follows: 40. |
| `isInside` | function | Lexical containment. Follows no symlink. |
| `realPathInside` | function | The real path of an existing path when it lies under a real root, else null. |
| `existingPathInside` | function | An existing path inside `root` both as written and after symlinks, as a `ContainedPath`, else null. |
| `openContainedFile` | function | Opens a path inside a real root and verifies the handle. Returns a `ContainedFile` or null. |
| `readContainedFile` | function | Reads a regular file inside a real root, else null. |
| `ContainedFile` | type | `{ handle, stats }`, as `openContainedFile` returns it. |
| `ContainedPath` | type | `{ realPath, relativePath }`, as `existingPathInside` returns it. |

The TSDoc in the package has the details, and `examples/usage.test.ts` uses each
export. The [CHANGELOG](./CHANGELOG.md) lists the changes.

## Twin

The Rust crate [`path-guard`](https://crates.io/crates/path-guard) has the same
two layers. Its source is in
[`packages/rust/path-guard`](https://github.com/osdlc/osdlc/tree/main/packages/rust/path-guard).
Both read one conformance fixture,
`packages/rust/path-guard/tests/fixtures/parity.json` in the repository, so
they agree on every case in it.

## Runtimes and platforms

Node.js 22 or later, ESM only. Linux and macOS are tested.

## Security

The package reads the filesystem and runs no commands. See
[SECURITY.md](./SECURITY.md) to report a problem.

## License

`MIT OR Apache-2.0`, at your option.
