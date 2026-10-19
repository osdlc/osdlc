# Changelog

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
