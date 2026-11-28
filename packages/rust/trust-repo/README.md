# trust-repo

Per-user consent to run a repository's own scripts. A tool that runs a repository's code cannot
take the permission from a file inside it, since the repository could grant itself. A person
grants it once per repository, and the grant is kept outside every checkout.

A Rust port of the whole-repository part of `@osdlc/trust-repo` (osdlc,
`packages/ts/trust-repo/`), sharing its store. The crate reads no environment and starts no
program: the caller passes the variables and the home folder, so a test never touches the real
store.

## Install

```sh
cargo add trust-repo
```

## Quick start

```rust
use std::path::Path;
use trust_repo::{TrustStore, resolve_exec_gate, trust_store_dir, withheld_hint};

let state = tempfile::tempdir()?;
let repo = tempfile::tempdir()?;
let var = |name: &str| (name == "XDG_STATE_HOME").then(|| state.path().display().to_string());
let store = TrustStore::at(trust_store_dir("tooly", &var, Path::new("/home/u")));

let gate = resolve_exec_gate(&store, repo.path(), true, None)?;
assert!(!gate.allow_exec);
println!("{}", withheld_hint("tooly", "trust", Some("--trust")));

store.trust(repo.path())?;
assert!(resolve_exec_gate(&store, repo.path(), true, None)?.allow_exec);
# Ok::<(), Box<dyn std::error::Error>>(())
```

## Where the store is

`$XDG_STATE_HOME/<tool>/trusted/`, or `<home>/.local/state/<tool>/trusted/` when
`XDG_STATE_HOME` is unset, blank, or relative once a leading `~` is expanded (`trust_store_dir`).
A tool with its own variable for the folder passes the folder itself to `TrustStore::at`.

## What a grant is keyed on

The root's real path: as much of it as exists resolved through symlinks, the rest kept as
written, so two paths to one repository share one grant. Not a content hash: a trusted
repository stays trusted after it pulls changes, until `untrust`.

## How it is stored

One marker file per trusted root, named `<slug(basename(root))>-<first 16 hex of sha256(root)>`:
`slug` turns each character outside `A-Za-z0-9._-` into one `-` per UTF-16 unit, as the
TypeScript library does, and an empty basename is `root`. The file holds the resolved root and a
newline, written to a temporary file and renamed. A marker counts when its first line is not
blank; `list` also skips a file not named as the marker of the root it holds. Files ending
`.tmp` are not grants, and per-scope folders (`<marker>.scopes/`) are left alone. On Unix the
folder is 0700 and each marker 0600; `trust` tightens looser modes of the folder and of regular
files named as their root's marker, and touches nothing else, not even a marker that is a link.

## The rule

`resolve_exec_gate(store, root, configured, flag)`:

| flag | configured | trusted | allow_exec | reason |
| --- | --- | --- | --- | --- |
| `Some(false)` | any | not read | false | `ConfiguredOff` |
| `Some(true)` | any | not read | true | `AllowedByFlag` |
| `None` | false | any | false | `ConfiguredOff` |
| `None` | true | false | false | `Untrusted` |
| `None` | true | true | true | `Allowed` |

A flag is answered without reading the store, so a missing or unreadable store cannot block it.
A flag of `true` is consent for one run and is never saved. `withheld_hint` gives the refusal
sentence: `this repository is not trusted — run "<tool> <verb>" to trust it, or pass <flag> for
this run only`, the last clause only when there is a flag.

There is no exception for git hooks: a run a hook starts is refused like any other.

Not ported: per-scope grants, the standing policy (`trust.paths`, `trust.owners`), `tighten` as a
call of its own, and the Windows path folding.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT License](LICENSE-MIT), at your option.
