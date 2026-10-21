---
'@osdlc/path-guard': minor
---

**Breaking:** the 0.3.0 API makes the filesystem a call uses visible, as decision D-06 sets. It matches the Rust crate `path-guard` 0.3.0. Text-only checks live in a `lexical` namespace, filesystem checks run on a `PathGuard` bound to one `Resolver`, and the real disk lives in a new `@osdlc/path-guard/node` entry. No function reads the working directory, and every argument that names a place on the filesystem must be absolute. The 0.2 exports are removed, with no deprecated aliases.

Removed or moved, and what replaces each:

- `validateRelative` → `lexical.validateRelative` (also `validateRelative` from `@osdlc/path-guard/lexical`).
- `toRelative` → `lexical.toRelative`.
- `lexicalAbsolute(path)` → `lexical.absolute(path, cwd)`. Pass the working directory yourself, such as `process.cwd()`. It takes POSIX paths on every platform; on Windows use `path.resolve`.
- `isInside(root, path)` → `lexical.isUnder(root, path)`, with absolute POSIX paths. A relative path is joined by the caller: `lexical.isUnder(root, lexical.absolute(p, process.cwd()))`. On Windows, use `guard.contains`, which reads Windows paths and follows symlinks.
- `resolveInside(root, raw, resolver?)` → `guard.resolve(root, raw)`, such as `nodeGuard.resolve(root, raw)`.
- `tryResolveInside(root, raw, resolver?)` → `guard.tryResolve(root, raw)`.
- `contains(outer, inner, resolver?)` → `guard.contains(outer, inner)`.
- `canonicalExistingPrefix(path, resolver?)` and `realpathOrSelf(path)` → `guard.realPath(absPath)`. Where the walk gives up, it returns the path with `..` folded as text, as `realpathOrSelf` did; `canonicalExistingPrefix` returned the path as written.
- `nodeResolver` → moved to `@osdlc/path-guard/node`.
- `openContainedFile`, `readContainedFile`, `realPathInside`, `existingPathInside`, `ContainedFile` and `ContainedPath` → moved to `@osdlc/path-guard/node`, with no other change. They still call Node `fs` directly and accept a relative path.
- A `Resolver` is no longer an optional last argument. Build a guard with `new PathGuard(resolver)`.

New:

- `lexical`, a namespace with `validateRelative`, `isUnder`, `absolute` and `toRelative`. It reads no ambient state and loads no `node:` module.
- `PathGuard`, with `resolve`, `tryResolve`, `contains` and `realPath`, and an `onWarning` option: `new PathGuard(resolver, { onWarning })`.
- `PathWarning`, `{ kind: 'reserved_name' | 'alternate_stream', segment }`.
- The `@osdlc/path-guard/node` entry with `nodeGuard`, a `PathGuard` over `nodeResolver`.
- `absolute` and `PathWarning` in the `@osdlc/path-guard/lexical` entry.
- `PathErrorKind` gains `unresolvable`, `empty_root`, `not_under_root`, `not_absolute`, `reserved_name` and `alternate_stream`.

Behaviour changes:

- `escapes` now means only a path proved outside the root. A link loop, more than `MAX_LINK_HOPS` links or a spent resolver-call budget is `unresolvable`, and an empty root is `empty_root`. Code that tests `kind === 'escapes'` changes branch with no compile error.
- `guard.resolve` refuses with `unresolvable` when the walk of the root itself gives up, as for a root that is a link loop. `resolveInside` measured against the root as written, and could accept.
- A resolver that gives a real path for the root that is not absolute, such as the empty path, can no longer make the root hold every path: `guard.resolve` refuses with `escapes`, `guard.contains` answers false, and `guard.realPath` falls back to the path folded as text.
- An empty root is refused as `empty_root` by every function that takes a root. Any other relative or empty argument (a root, `outer`, `inner`, the path given to `realPath`, or `cwd`) is refused as `not_absolute`. The root is checked first. In 0.2 a relative argument was resolved against the working directory, and `contains` answered false for an empty `outer`.
- `guard.contains` throws a `PathError` for a refused argument (`empty_root` or `not_absolute`). Otherwise it answers true or false, and false also means "cannot prove".
- `isUnder` throws `not_absolute` for a relative argument and `empty_root` for an empty root, where it returned false.
- `toRelative` throws `empty_root` for an empty root, where it threw `parent_segment`; `not_under_root` for a path not under the root, where it threw `escapes`; and `not_absolute` for a relative root or path, where it threw `escapes` or answered as text.
- On Windows, a segment that is a reserved device name (`NUL`, `con.txt`, `COM1`, `CONIN$`) or names an alternate data stream (`file.txt:stream`) is refused by `guard.resolve` and `guard.tryResolve` with kind `reserved_name` or `alternate_stream`, before the filesystem is read. On other platforms the guard accepts it and calls its `onWarning` once per match. `lexical.validateRelative` never refuses these names; with `onWarning` it reports them on every platform. With no `onWarning`, nothing is reported, and the package never writes to the console.
- On Windows the guard takes a path as absolute only with a drive and a root (`C:\`) or a UNC share. A root with no drive (`\x`) is refused as `not_absolute`, where it took the current drive.
