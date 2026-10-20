# path-guard

Join an untrusted, root-relative path onto a root and prove it cannot escape.

A path from a client, a config file or a shell cannot be trusted.
`root.join(user_input)` can walk out of the root with `..`, an absolute path, a
`~`, a Windows drive, or a symlink whose target leaves the root although its
spelling never says `..`. A substring check like `!p.contains("..")` is weak
both ways: it rejects innocent names (`My ..dotfiles note.md`) and misses the
symlink escape.

path-guard is for a server or tool that stores files under one root and must
keep every request inside it. Reach for it wherever a path from outside is
joined onto a root. It is not a sandbox or a lock: the check is a snapshot (see
below), and it does not restrict what your own process may open.

## Install

```sh
cargo add path-guard
```

## Quick start

```rust
use std::path::Path;

let root = Path::new("/srv/data");
assert!(path_guard::resolve(root, "notes/a.md").is_ok());
assert!(path_guard::resolve(root, "../etc/passwd").is_err());
```

## How it works

Two layers, both mandatory:

1. **Lexical**: `validate_relative` rejects empty paths, NUL bytes, a leading
   `~`, Windows drive and UNC prefixes, absolute paths, and `.`, `..` or empty
   segments, without touching the filesystem. A name that only contains dots
   (`My ..dotfiles note.md`) is accepted.
2. **Containment**: `resolve` joins a validated path onto a root and proves the
   result stays inside it. It resolves symlinks in whatever part of the path
   exists, so a symlink whose target leaves the root is refused, and a path
   that does not exist yet can still be checked. A dangling symlink is followed
   to where its target would be created, so a link to a missing file outside
   the root is refused too; a chain of more than 40 links is refused.
   `contains` answers the same question for two absolute paths.

The check is a snapshot. A symlink planted or changed after `resolve` returns
is not seen. To create a file, open it with
`OpenOptions::new().write(true).create_new(true)`: that open fails when the
final component is a symlink, dangling or not. A symlink swapped into a parent
directory still needs a per-component no-follow open. A hard link to a file
outside the root is out of reach of any path check.

The containment layer reads the filesystem through the `Resolver` trait.
`StdResolver` uses `std::fs::canonicalize` and `std::fs::read_link`;
`resolve_with` and `contains_with` take any other, such as an in-memory
filesystem.

## Alternatives

Several crates guard paths. path-guard differs by pairing a lexical pre-check
with a symlink-aware containment proof over a pluggable resolver, and by
sharing one cross-language conformance fixture with a TypeScript twin.

- `path_jail`, `strict-path`: resolve a path and confine it to a root. Similar
  goal; path-guard adds the lexical layer and the pluggable `Resolver`, and
  checks paths that do not exist yet.
- `path_ratchet`, `path_trav`: lexical or type-level traversal checks.
  path-guard also follows symlinks.
- `path-security`, `safe-path`: broader path sanitisation and
  container-runtime path handling.

If you need only one of these halves, a smaller crate may fit better.

## Platforms

The lexical layer (`validate_relative`) is platform-independent. `lexical_absolute`
follows the platform's meaning of an absolute path: on Windows a path with a
root but no drive is anchored at the current directory. The containment layer is tested
fully on Unix. On Windows the lexical checks still apply, and symlink
resolution follows whatever `std::fs::canonicalize` does there.

On Windows the containment layer has a known gap. Windows folds `..` as text
before it follows a link, but the crate folds a `..` behind a missing name
against the real path, as on POSIX. So for a path that does not exist yet, with
a `..` after a symlink, the crate can judge a different path from the one
Windows opens, and accept one that leaves the root. The TypeScript twin
follows the Windows rule. The fix is tracked in
[T-02](https://github.com/osdlc/osdlc/blob/main/packages/ts/path-guard/docs/planning/tasks/T-02-rust-windows-dot-dot-fold.md).

## Stability

Every public item is stable in 0.x. There are no experimental items.
`PathError` is `#[non_exhaustive]`, so match it with a `_` arm that refuses the
path. A new variant comes only in a new minor version, such as 0.3.0, together
with the TypeScript twin's new error kind, and the CHANGELOG names it. Every
variant, present and future, means the path was refused.

## Twin

`@osdlc/path-guard` is the TypeScript twin. Both read one conformance fixture,
so they agree on every case.

The [planning folder](https://github.com/osdlc/osdlc/blob/main/packages/rust/path-guard/docs/planning/README.md) defines the terms both twins share.

## License

MIT OR Apache-2.0.
