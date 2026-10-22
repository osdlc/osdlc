# @osdlc/path-guard

## 0.3.1

### Patch Changes

- fb712e0: Make every package follow the same conventions. The published manifests and READMEs change; the runtime code and the `dist/` files do not.
  
  - `author` is `sksizer` in every manifest (`@osdlc/typed-gh` had none).
  - `engines.node` is no wider than any dependency's. `@osdlc/typed-gh` and `@osdlc/code-host` now declare `^22.22.2 || ^24.15.0 || >=26.0.0`, the range of `@osdlc/typed-git` and its dependency `hosted-git-info`. `@osdlc/cli-tool` and `@osdlc/trust-repo` declare `>=22`, not `>=22.18`: a `dist/` install needs no TypeScript stripping.
  - `@osdlc/tsconfig` and `@osdlc/prettier-config` are ESM with `sideEffects: false`, and ship SECURITY.md and CONTRIBUTING.md. `@osdlc/prettier-config` has an `exports` map (`.` is `index.json`) in place of `main`.
  - Every README has `## Install` and `## Licence` sections, and every CHANGELOG starts `# @osdlc/<name>`.
  - `@osdlc/color` and `@osdlc/markdown-contract` no longer set a coverage threshold.
  - `@osdlc/yaml-splice` reaches its WebAssembly glue through a `#wasm` entry in `imports`. The shipped `dist/` files are the same.

## 0.3.0

### Minor Changes

- b9d583c: **Breaking:** the 0.3.0 API makes the filesystem a call uses visible, as decision D-06 sets. It matches the Rust crate `path-guard` 0.3.0. Text-only checks live in a `lexical` namespace, filesystem checks run on a `PathGuard` bound to one `Resolver`, and the real disk lives in a new `@osdlc/path-guard/node` entry. No function reads the working directory, and every argument that names a place on the filesystem must be absolute. The 0.2 exports are removed, with no deprecated aliases.
  
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
  - A `Resolver` answer must be absolute and canonical. The guard does not trust a real path that is relative (such as the empty path) or holds a `.` or `..` segment, for the root or for any part of the path it walks: `guard.resolve` refuses with `escapes`, `guard.contains` answers false, and `guard.realPath` falls back to the path folded as text. Before, such an answer could make the root hold every path, or put a path under the root that the filesystem puts elsewhere.
  - An empty root is refused as `empty_root` by every function that takes a root. Any other relative or empty argument (a root, `outer`, `inner`, the path given to `realPath`, or `cwd`) is refused as `not_absolute`. The root is checked first. In 0.2 a relative argument was resolved against the working directory, and `contains` answered false for an empty `outer`.
  - `guard.contains` throws a `PathError` for a refused argument (`empty_root` or `not_absolute`). Otherwise it answers true or false, and false also means "cannot prove".
  - `isUnder` throws `not_absolute` for a relative argument and `empty_root` for an empty root, where it returned false.
  - `toRelative` throws `empty_root` for an empty root, where it threw `parent_segment`; `not_under_root` for a path not under the root, where it threw `escapes`; and `not_absolute` for a relative root or path, where it threw `escapes` or answered as text.
  - On Windows, a segment that is a reserved device name (`NUL`, `con.txt`, `COM1`, `CONIN$`) or names an alternate data stream (`file.txt:stream`) is refused by `guard.resolve` and `guard.tryResolve` with kind `reserved_name` or `alternate_stream`, before the filesystem is read. On other platforms the guard accepts it and calls its `onWarning` once per match. `lexical.validateRelative` never refuses these names; with `onWarning` it reports them on every platform. With no `onWarning`, nothing is reported, and the package never writes to the console.
  - On Windows the guard takes a path as absolute only with a drive and a root (`C:\`) or a UNC share. A root with no drive (`\x`) is refused as `not_absolute`, where it took the current drive.

## 0.2.4

### Patch Changes

- 4d3e654: Fix the containment layer on Windows, which read only POSIX paths. There, `resolveInside` and `contains` did not see a symlink that leads out of the root, and so accepted it. They now read `\` as a separator and a drive or UNC share as a root, and fold `..` as text before following a link, as Node and Windows do. `nodeResolver` uses `realpathSync.native` on Windows. On Windows, `resolveInside`, `canonicalExistingPrefix` and `realpathOrSelf` return paths with `\` separators, and `existingPathInside` gives `relativePath` with `/` separators, as on POSIX. Nothing changes on Linux or macOS. Windows is now tested in CI, and the README lists its limits.

## 0.2.3

### Patch Changes

- 9c1261e: Add a `@osdlc/path-guard/lexical` entry for code that cannot load Node. It holds `validateRelative`, `PathError`, `PathErrorKind`, `toRelative` and a new text-only check, `isUnder(root, path)`. Nothing it loads imports `node:*`. The main entry exports what it did before.

## 0.2.2

### Patch Changes

- 59accf1: First public release. A path containment guard in two layers, the same design as the Rust crate path-guard 0.2.3. `validateRelative` refuses a hostile relative path (empty, NUL byte, leading `~`, Windows drive or UNC prefix, absolute, or a `.`, `..` or empty segment) without touching the filesystem. `resolveInside`, `contains` and `canonicalExistingPrefix` then prove that a path stays inside its root, resolving symlinks in the part of the path that exists, so a path that does not exist yet can be checked too.
  
  Containment checks are tested on Linux and macOS.
  
  The additions:
  
  - `validateRelative`, which returns the normalised form of a root-relative path, and `PathError`, whose `kind` is one of `empty`, `nul`, `tilde`, `windows_path`, `absolute`, `parent_segment`, `degenerate_segment` or `escapes`.
  - `resolveInside` joins a validated path onto a root and throws `PathError` if the result leaves it. `tryResolveInside` returns null instead of throwing. Neither the path nor the root has to exist. A root that reduces to the empty path (`''`, or a relative `missing/..`) is refused, and `contains` answers false for such an `outer`.
  - `contains(outer, inner)` answers the same question for two absolute paths. `canonicalExistingPrefix` and `realpathOrSelf` give the real path of the part that exists and keep the rest as written, with any `..` folded against the real path.
  - `lexicalAbsolute` makes a path absolute against the working directory and folds `.` and `..` as text, with no filesystem access. `toRelative(root, abs)` turns an absolute path under `root` back into a root-relative one with `/` separators, and throws `PathError` of kind `escapes` or `parent_segment`. Both match the Rust crate's `lexical_absolute` and `to_relative`.
  - `Resolver`, with `realpath` and `readlink`, and `nodeResolver`, the real filesystem. Every containment function takes a `Resolver` as its last argument.
  - `MAX_LINK_HOPS`, the number of dangling symlinks one check follows (40). A longer chain is refused. A check that would spend too many resolver calls is refused: `resolveInside` throws, `contains` answers false, and `canonicalExistingPrefix` returns the path as written.
  - `openContainedFile` and `readContainedFile`: the open is non-blocking, so a FIFO cannot hang the call, and the handle is accepted only when it is the file found at the path's real path (same device and inode). `realPathInside`, `existingPathInside` and `isInside`, with the types `ContainedFile` and `ContainedPath`.

## History before the first public release

These versions were never published. They are rebuilt from the git history.

### [0.2.1] - 2026-10-11 (unpublished)

#### Added

- `tryResolveInside`, which returns null instead of throwing a `PathError`.

#### Fixed

- A root that does not exist yet under a symlinked parent no longer refuses every path.
  `resolveInside` resolves the existing prefix of the root, as it does for the path.

### [0.2.0] - 2026-10-11 (unpublished)

#### Added

- `MAX_LINK_HOPS`, the number of dangling symlinks one check follows.

#### Changed

- Breaking: `Resolver` has a required `readlink` method. `nodeResolver` implements it with
  `readlinkSync`. A custom `Resolver` must add it.

#### Fixed

- A dangling symlink inside the root no longer escapes. `resolveInside` and `contains` follow it to
  where its target would be created, and refuse a chain of more than 40 links.

### [0.1.0] - 2026-10-06 (unpublished)

#### Added

- The first version, the TypeScript twin of the Rust crate path-guard.
- `validateRelative` and `PathError`: lexical rejection of empty paths, NUL bytes, a leading `~`,
  Windows drive and UNC prefixes, absolute paths and `.`, `..` or empty segments.
- `resolveInside`, `contains`, `canonicalExistingPrefix`, `realpathOrSelf` and `nodeResolver`:
  symlink-aware containment checks, including for paths that do not exist yet.
- `existingPathInside`, `isInside`, `realPathInside`, `openContainedFile` and
  `readContainedFile`.
