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

- To check a path that may pass through a symlink with `lexical.isUnder`. It
  compares text only and follows no symlink, so a link inside the root that
  points out of it passes. Use `nodeGuard.resolve`, or `realPathInside` for a
  path that exists.
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
shares one test fixture with the `path-guard` Rust crate. If you need only one
of those halves, a smaller package may fit better.

## Install

```sh
npm install @osdlc/path-guard
```

`pnpm add @osdlc/path-guard` and `yarn add @osdlc/path-guard` work too.

## Quick start

```ts
import { PathError } from '@osdlc/path-guard'
import { nodeGuard } from '@osdlc/path-guard/node'

// The root must be absolute.
const root = process.platform === 'win32' ? 'C:\\srv\\data' : '/srv/data'

nodeGuard.resolve(root, 'notes/a.md')
// /srv/data/notes/a.md

try {
  nodeGuard.resolve(root, '../etc/passwd')
} catch (e) {
  if (e instanceof PathError) e.kind
  // parent_segment
}
```

`examples/usage.test.ts` runs every export of this package.

## Three entry points

The import path says which filesystem a call uses.

| Entry | Exports | Filesystem |
|---|---|---|
| `@osdlc/path-guard` | `lexical`, `PathGuard`, `Resolver`, `PathError`, `PathErrorKind`, `PathWarning`, `MAX_LINK_HOPS` | None of its own. A `PathGuard` uses the `Resolver` it is given. Loads `node:path`, not `node:fs`. |
| `@osdlc/path-guard/lexical` | `validateRelative`, `isUnder`, `absolute`, `toRelative`, `PathError`, `PathErrorKind`, `PathWarning` | None. Loads no `node:` module, so a browser bundle can use it. |
| `@osdlc/path-guard/node` | `nodeGuard`, `nodeResolver`, `openContainedFile`, `readContainedFile`, `realPathInside`, `existingPathInside`, `ContainedFile`, `ContainedPath` | The real disk, through Node `fs`. |

The `lexical` namespace of the main entry holds the same four functions as
`@osdlc/path-guard/lexical`.

Every argument that names a place on the filesystem must be absolute: the root,
`outer` and `inner`, the path given to `realPath`, and the `cwd` given to
`lexical.absolute`. No function reads the working directory. A caller with a
relative path joins it first, for example with
`lexical.absolute(p, process.cwd())` on POSIX or `path.resolve(p)` on any
platform. An empty root is refused with kind `empty_root`, and any other
relative argument with kind `not_absolute`.

## How it works

Two layers, both mandatory:

1. **Lexical**: `lexical.validateRelative` rejects empty paths, NUL bytes, a
   leading `~`, Windows drive and UNC prefixes (a single letter then `:`
   included), absolute paths, and `.`, `..` or empty segments, without
   touching the filesystem. It returns the normalised form: backslashes folded
   to `/`, no trailing slash. A name that only contains dots
   (`My ..dotfiles note.md`) is accepted.
2. **Containment**: `guard.resolve(root, raw)` validates `raw`, joins it onto
   the root and proves the result stays inside it. It resolves symlinks in
   whatever part of the path exists, so a symlink out of the root is refused,
   and a path that does not exist yet can still be checked. The root need not
   exist either. A dangling symlink is followed to where its target would be
   created, so a link to a missing file outside the root is refused too.
   `guard.tryResolve` is the same check returning null instead of throwing.
   `guard.contains(outer, inner)` answers the same question for two absolute
   paths, and returns false when it cannot prove the answer.

A guard is bound to one filesystem: `new PathGuard(resolver)`. A `Resolver`
answers `realpath` and `readlink`. `nodeGuard` is the guard over the real disk,
`nodeResolver`. Any other `Resolver`, such as an in-memory table, drives every
filesystem case with no disk access. A table must also hold every ancestor of
each entry, as the `Resolver` TSDoc requires. A table of leaf entries gives
wrong answers with no error.

```ts
import { PathGuard, type Resolver } from '@osdlc/path-guard'

const missing = () => {
  throw new Error('ENOENT')
}
// A filesystem of one directory, `/v`, and nothing in it.
const fs: Resolver = {
  realpath: (p) => (p === '/' || p === '/v' ? p : missing()),
  readlink: missing,
}
const guard = new PathGuard(fs)
if (process.platform !== 'win32') {
  guard.contains('/v', '/v/new/deep.md') // true
  guard.tryResolve('/v', '../a.md') // null
}
```

`guard.realPath(absPath)` gives the real path of the part of a path that exists
and keeps the rest as written, with any `..` folded against the real path. When
the walk gives up (a link loop, too many links, a spent budget), it returns the
path with `..` folded as text. The answer never holds a `..`, and a missing path
is not an error.

A refusal throws a `PathError`. Its `kind` is one of these, and
`PathErrorKind` is that union:

| Kind | Meaning |
|---|---|
| `empty`, `nul`, `tilde`, `windows_path`, `absolute`, `parent_segment`, `degenerate_segment` | `lexical.validateRelative` refused the relative path. |
| `escapes` | The path is proved to lie outside the root. |
| `unresolvable` | The walk followed more than `MAX_LINK_HOPS` (40) links, as in a loop, or spent its resolver calls. The guard cannot prove where the path lands. |
| `empty_root` | The root is the empty path. |
| `not_under_root` | `lexical.toRelative`: the path does not start with the root. |
| `not_absolute` | An argument that must be absolute is relative or empty. |
| `reserved_name`, `alternate_stream` | On Windows, a segment is a device name or names an alternate data stream. See [Windows names](#windows-names). |

The check is a snapshot. A symlink planted or changed after `guard.resolve`
returns is not seen. To create a file, open it with `fs.open(path, 'wx')`. That
open fails when the final component is a symlink, dangling or not. A symlink
swapped into a parent directory still needs a per-component no-follow open,
which Node does not have.

## Text only: the lexical functions

The four `lexical` functions touch no filesystem, read no working directory and
take POSIX paths on every platform. They ship in the browser-safe
`@osdlc/path-guard/lexical` entry too.

- `validateRelative(raw, { onWarning })`: layer 1, above.
- `isUnder(root, path)`: is `path` the root or beneath it, by text? `..` is
  folded, whole components are compared. It follows no symlink, so it cannot
  see a link that leads out of the root. A Windows caller uses
  `guard.contains`, which reads Windows paths.
- `absolute(path, cwd)`: `path` joined onto `cwd` when relative, then folded:
  `.` dropped, each `..` removed with the component before it.
- In all four, `/` is the only separator and `\` is part of a name.
- `toRelative(root, abs)`: an absolute path under `root` as a root-relative one
  with `/` separators. It throws `not_under_root` when `abs` is not under
  `root`, and `parent_segment` when the relative part holds a `..`.

```ts
import { absolute, isUnder, toRelative, validateRelative } from '@osdlc/path-guard/lexical'

isUnder('/vault', '/vault/a.md') // true
isUnder('/vault', '/vault2/a.md') // false
absolute('notes/../a.md', '/vault') // '/vault/a.md'
toRelative('/vault', '/vault/notes/a.md') // 'notes/a.md'
validateRelative('notes/a.md') // 'notes/a.md'
```

## Windows names

Some names mean a device or a stream on Windows and an ordinary file elsewhere:
a reserved device name such as `NUL`, `con.txt` or `COM1`, and a `name:stream`
alternate data stream. The check runs on every segment. A `PathWarning` names
the kind and the segment.

- `lexical.validateRelative` never refuses these names. With `onWarning`, it
  calls the handler once per match, in order, on every platform.
- `PathGuard` knows its platform. On Windows, `resolve` and `tryResolve` refuse
  the first match with kind `reserved_name` or `alternate_stream`, before they
  read the filesystem, and call no handler. On other platforms the guard
  accepts the path, and when it returns the path it calls the `onWarning` given
  to `new PathGuard(resolver, { onWarning })` once per match.

With no `onWarning`, nothing is reported. The package never writes to the
console.

```ts
import { lexical, type PathWarning } from '@osdlc/path-guard'

const warnings: PathWarning[] = []
lexical.validateRelative('logs/NUL', { onWarning: (w) => warnings.push(w) }) // 'logs/NUL'
warnings // [{ kind: 'reserved_name', segment: 'NUL' }]
```

## Reading a file inside a root

A check followed by a read leaves a window: the file or a parent directory can
be swapped for a symlink in between. The helpers in `@osdlc/path-guard/node`
call the real disk directly and take no `Resolver`. Unlike the guard, they
accept a relative path, resolved against the working directory.

`openContainedFile(realRoot, path)` checks, opens, then resolves the path
again. It accepts the handle only when it is the file found at that real path,
with the same device and inode. The open is non-blocking, so a FIFO cannot hang
the call. The handle can still be a directory or another file that is not a
regular file, so check `stats.isFile()` before you read. The caller closes the
handle. It returns a `ContainedFile`, or null.

`readContainedFile` does that: it reads through `openContainedFile` and returns
null for anything that is not a regular file.

`realPathInside(realRoot, path)` and `existingPathInside(root, realRoot, path)`
resolve an existing path and check it against a root. `existingPathInside`
returns a `ContainedPath`.

## The API

| Export | Entry | Kind | What it is |
|---|---|---|---|
| `lexical` | `.` | namespace | `validateRelative`, `isUnder`, `absolute` and `toRelative`. |
| `validateRelative` | `./lexical` | function | Layer 1. Returns the normalised form of a root-relative path, or throws `PathError`. Reports Windows names to `onWarning`. |
| `isUnder` | `./lexical` | function | Text containment of two absolute POSIX paths, `..` folded. Follows no symlink. |
| `absolute` | `./lexical` | function | A path joined onto an absolute `cwd` and folded as text. |
| `toRelative` | `./lexical` | function | An absolute path under a root, as a root-relative path with `/` separators, or throws `PathError`. |
| `PathGuard` | `.` | class | `resolve`, `tryResolve`, `contains` and `realPath`, bound to one `Resolver`. |
| `Resolver` | `.` | type | `realpath` and `readlink`: how a guard reads a filesystem. |
| `PathError` | `.`, `./lexical` | class | The error every refusal throws. Its `kind` says why. |
| `PathErrorKind` | `.`, `./lexical` | type | The values `kind` takes. |
| `PathWarning` | `.`, `./lexical` | type | `{ kind, segment }`: a Windows device name or stream. |
| `MAX_LINK_HOPS` | `.` | constant | The number of dangling symlinks one check follows: 40. |
| `nodeGuard` | `./node` | object | A `PathGuard` over the real disk. |
| `nodeResolver` | `./node` | object | The real filesystem, with `..` resolved physically on POSIX. |
| `realPathInside` | `./node` | function | The real path of an existing path when it lies under a real root, else null. |
| `existingPathInside` | `./node` | function | An existing path inside `root` both as written and after symlinks, as a `ContainedPath`, else null. |
| `openContainedFile` | `./node` | function | Opens a path inside a real root and verifies the handle. Returns a `ContainedFile` or null. |
| `readContainedFile` | `./node` | function | Reads a regular file inside a real root, else null. |
| `ContainedFile` | `./node` | type | `{ handle, stats }`, as `openContainedFile` returns it. |
| `ContainedPath` | `./node` | type | `{ realPath, relativePath }`, as `existingPathInside` returns it. |

The TSDoc in the package has the details, and `examples/usage.test.ts` uses each
export. The [CHANGELOG](./CHANGELOG.md) lists the changes, and its 0.3.0 entry
maps each 0.2 export to its replacement.

The [planning folder](https://github.com/osdlc/osdlc/blob/main/packages/ts/path-guard/docs/planning/README.md) defines the terms the docs use and records the decisions behind the package.

## Stability

Every export is stable in 0.x. No export is experimental, beta or alpha.
`tests/stability.test.ts` fails when an export is tagged `@experimental`,
`@beta` or `@alpha` and is not listed in this section. A breaking change comes
only in a new minor version, such as 0.3.0, and the CHANGELOG marks it. A
breaking release removes the old API; it keeps no deprecated aliases.

`PathErrorKind` grows only in a new minor version, in this package and the Rust
twin together, and the CHANGELOG names the new kind. Every kind, present and
future, means the path was refused. When you branch on `kind`, give the branch a
default that refuses the path, so a kind added later is still a refusal. The
Rust `PathError` is `#[non_exhaustive]` for the same reason.

The [decisions](https://github.com/osdlc/osdlc/blob/main/packages/ts/path-guard/docs/planning/README.md#decisions)
say why.

## Twin

The Rust crate [`path-guard`](https://crates.io/crates/path-guard) 0.3.x has the
same shape: a `lexical` module and a `Guard` bound to one `Resolver`. Its source
is in
[`packages/rust/path-guard`](https://github.com/osdlc/osdlc/tree/main/packages/rust/path-guard).
Both read one conformance fixture,
`packages/rust/path-guard/tests/fixtures/parity.json` in the repository, so
they agree on every case in it. `tryResolve`, the `@osdlc/path-guard/lexical`
entry, the race-checked helpers of `@osdlc/path-guard/node` and the
`PathErrorKind` type exist only in TypeScript.

## Runtimes and platforms

Node.js 22 or later, ESM only. Linux, macOS and Windows are supported, and CI
tests each on Node 22 and 24. The `@osdlc/path-guard/lexical` entry also runs in
browsers, as it loads no Node modules.

On Windows the guard reads Windows paths:

- `\` and `/` both separate. A drive with a root (`C:\`) or a UNC share
  (`\\server\share\`) is absolute. A root with no drive (`\x`) and a bare
  drive (`C:x`) are relative, so the guard refuses them as `not_absolute`.
- A `..` folds as text before any link is followed, as Windows does. On POSIX,
  `link/..` is the parent of the link's target; on Windows it is the directory
  that holds the link.
- `guard.resolve` and `guard.realPath` return paths with `\` separators. A
  `Resolver` is asked with `/` separators and may answer with either.
- `nodeResolver` uses `realpathSync.native`, which also expands short (8.3)
  names.
- The guard refuses device names and alternate data streams, as
  [Windows names](#windows-names) says.

Limits on Windows:

- A drive letter matches in any case, but the names after it are compared as
  written. A missing path spelled in another case than its root is refused.
- The `lexical` functions take POSIX paths only, on every platform. They are
  text checks, and they ship in the browser-safe entry. In them `\` is part of
  a name, not a separator, so `lexical.isUnder('/v', '/v/..\\..\\etc')` is
  `true`, while Windows reads that path as outside `/v`. Windows callers use
  the guard, such as `nodeGuard.contains`, which reads Windows paths.

## Security

The package reads the filesystem and runs no commands. See
[SECURITY.md](./SECURITY.md) to report a problem.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
