# Changelog

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
