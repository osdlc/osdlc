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
use path_guard::Guard;

let guard = Guard::std();
let root = std::env::temp_dir(); // any absolute directory
assert!(guard.resolve(&root, "notes/a.md").is_ok());
assert!(guard.resolve(&root, "../etc/passwd").is_err());
```

## How it works

Two layers, both mandatory:

1. **Lexical**: the `lexical` module checks text only. It takes no filesystem
   and reads no current directory or platform.
   `lexical::validate_relative` rejects empty paths, NUL bytes, a leading `~`,
   Windows drive and UNC prefixes, absolute paths, and `.`, `..` or empty
   segments. A name that only contains dots (`My ..dotfiles note.md`) is
   accepted.
2. **Containment**: a `Guard` is bound to one filesystem. `Guard::std()` is the
   real disk. `guard.resolve(root, raw)` joins a validated path onto a root
   and proves the result stays inside it. It resolves symlinks in whatever
   part of the path exists, so a symlink whose target leaves the root is
   refused, and a path that does not exist yet can still be checked. A
   dangling symlink is followed to where its target would be created, so a
   link to a missing file outside the root is refused too.
   `guard.contains(outer, inner)` answers the same question for two absolute
   paths, and `guard.real_path(path)` returns the real path of as much of a
   path as exists.

Every path a guard is given must be absolute. The guard reads no current
directory, so a relative root is refused as `NotAbsolute` and an empty one as
`EmptyRoot`. Join the current directory yourself first.

The check is a snapshot. A symlink planted or changed after `resolve` returns
is not seen. To create a file, open it with
`OpenOptions::new().write(true).create_new(true)`: that open fails when the
final component is a symlink, dangling or not. A symlink swapped into a parent
directory still needs a per-component no-follow open. A hard link to a file
outside the root is out of reach of any path check.

The guard reads the filesystem through the `Resolver` trait. `StdResolver`
uses `std::fs::canonicalize` and `std::fs::read_link`. `Guard::new(resolver)`
takes any other, such as an in-memory filesystem in a test. A `&R` or an
`Arc<R>` of a resolver is a resolver too.

```rust
use path_guard::{lexical, Guard, PathError};
use std::path::Path;

let guard = Guard::std();

// An empty root and a relative root are refused before the path is read.
assert_eq!(guard.resolve(Path::new(""), "a.md"), Err(PathError::EmptyRoot));
assert!(matches!(
    guard.resolve(Path::new("data"), "a.md"),
    Err(PathError::NotAbsolute { argument: "root", .. })
));

// Text checks read POSIX paths and take what they need, such as the
// directory to join onto, as arguments.
let root = Path::new("/srv/data");
let abs = lexical::absolute(Path::new("notes/../a.md"), root).unwrap();
assert_eq!(abs, Path::new("/srv/data/a.md"));
assert_eq!(lexical::is_under(root, &abs), Ok(true));
assert_eq!(lexical::to_relative(root, &abs).unwrap(), "a.md");
```

### Errors

`PathError` names the first rule a path broke. Besides the lexical kinds:

| Variant           | Meaning                                                                         |
| ----------------- | ------------------------------------------------------------------------------- |
| `Escapes`         | Proved outside the root                                                         |
| `Unresolvable`    | More than `MAX_LINK_HOPS` (40) links, such as a loop, or the call budget spent  |
| `EmptyRoot`       | The root is the empty path                                                      |
| `NotUnderRoot`    | `lexical::to_relative`: the path does not start with the root                   |
| `NotAbsolute`     | A path argument is relative or empty. `argument` names which one.               |
| `ReservedName`    | On Windows, a segment is a device name such as `NUL`. The guard refuses it.     |
| `AlternateStream` | On Windows, a segment names a stream such as `ab:c`. The guard refuses it.       |
| `NotUtf8`         | A path is not valid UTF-8. Rust only: the TypeScript twin has no such kind.     |

`guard.contains` returns `Ok(false)` where it cannot prove containment, and
`Err` only for an argument it refuses. `guard.real_path` fails only for a
relative path: where its walk gives up, it returns the path with `..` folded
as text.

## Windows names

Some names mean a device or a stream on Windows and an ordinary file
elsewhere: `NUL`, `nul.txt`, `COM1`, `CONIN$`, or `file.txt:stream`. On
Windows a guard refuses them as `ReservedName` or `AlternateStream`, before it
reads the filesystem. On other platforms it accepts them and, for a path it
accepts, calls its warning handler once per match. With no handler, nothing is
reported. The crate never writes to the console.

```rust
use path_guard::{lexical, Guard, PathWarningKind};

// `lexical` refuses nothing and answers the same on every platform.
let found = lexical::windows_names("logs/NUL.txt");
assert_eq!(found[0].kind, PathWarningKind::ReservedName);
assert_eq!(found[0].segment, "NUL.txt");

let guard = Guard::std().with_warning_handler(|w| {
    // Log it, count it, or refuse the request yourself.
    let _ = w;
});
let got = guard.resolve(&std::env::temp_dir(), "logs/NUL.txt");
assert_eq!(got.is_err(), cfg!(windows));
```

The handler is a `Fn(&PathWarning) + Send + Sync + 'static`, so a `Guard`
stays `Clone`, `Send` and `Sync`.

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

The `lexical` module reads no platform. `validate_relative` and
`windows_names` fold `\` to `/` in a client's relative path. `is_under`,
`absolute` and `to_relative` read POSIX paths on every platform: only `/`
separates, so a `\` is part of a name, and `C:\v` is not absolute to them.
Use a guard for Windows paths. A Windows path given to
`lexical::to_relative` is `NotAbsolute`. To turn a path the guard returned
back into a relative one on Windows, use `Path::strip_prefix` on two paths
from `Guard::real_path`, so both are spelled the same way.

A guard reads paths as the platform does. On Windows "absolute" means a drive
or share and a root, such as `C:\v` or `\\server\share\v`, so `\v` is refused
as `NotAbsolute`. The containment layer is tested on Linux, macOS and Windows,
symlinks included.

On Windows a `..` folds as text before any link is followed, as Windows reads a
path: on Unix `link/..` is the parent of the link's target, and on Windows it is
the directory that holds the link. The TypeScript twin follows the same rule.

## Stability

Every public item is stable in 0.x. There are no experimental items.
`PathError` and `PathWarningKind` are `#[non_exhaustive]`, so match them with a
`_` arm; for `PathError`, that arm refuses the path. A new variant comes only
in a new minor version, together with the TypeScript twin's new kind, and the
CHANGELOG names it. Every `PathError` variant, present and future, means the
path was refused.

## Twin

`@osdlc/path-guard` 0.3.0 is the TypeScript twin. Both read one conformance
fixture, so they agree on every case. Its `lexical` namespace,
`PathGuard` class and `nodeGuard` match this crate's `lexical` module, `Guard`
and `Guard::std()`. Its race-checked file helpers in `@osdlc/path-guard/node`
have no Rust counterpart.

The [planning folder](https://github.com/osdlc/osdlc/blob/main/packages/rust/path-guard/docs/planning/README.md) defines the terms both twins share.

## License

MIT OR Apache-2.0.
