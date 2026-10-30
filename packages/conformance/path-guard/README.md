# path-guard

A path containment guard: lexical validation of a root-relative path, then a
symlink-aware proof that the path stays inside its root, and the lexical
helpers around it (`absolute`, `is_under`, `to_relative`, the Windows device
name and alternate data stream checks).

| Implementation | Language | Directory |
|---|---|---|
| `@osdlc/path-guard` (reference) | TypeScript | `packages/ts/path-guard` |
| `path-guard` | Rust | `packages/rust/path-guard` |

`suite.json` holds the cases. Each section's `description` says what a case
gives and takes. Write a new case's `input` by hand, then run

```sh
pnpm --filter @osdlc/path-guard conformance:write
```

on Linux or macOS to write its `expect` or `error`. Never write those by hand.
A case for `windows` only is written by the same command: it runs the
package a second time, loaded as on Windows.

## Platforms

- The guard reads "absolute" as the platform does. It needs a drive or UNC
  prefix and a root on Windows, so a `/v`-style root is `not_absolute` there.
  The runners put the `/v`-style roots and paths of the guard sections
  (`resolve`, `resolve_windows_names`, `contains`) on drive `C:` on Windows.
  The lexical sections (`validate_relative`, `windows_names`, `absolute`,
  `is_under`, `to_relative`) are POSIX strings on every host.
- `resolve_windows_names` gives a different answer on Windows, where the
  guard refuses a device name or an alternate data stream, than elsewhere,
  where it accepts the path and warns. Such a case is written once per
  platform, with `platforms`.
- An on-disk case (`resolve_on_disk`, `contains_on_disk`) with a `..`
  anywhere pins the POSIX rule, where `link/..` is the parent of the link's
  target, and has `platforms: ["unix"]`. Windows folds `..` as text before it
  follows a link, so on Windows both runners check such a case against where
  the filesystem puts the path instead of against `expect`. The case "a chain
  of links with long targets spends the call budget" is one: its targets hold
  `..`, so on Windows the chain is cheap.

Each implementation's README lists what it does that the other does not, and
its own error messages, which the suite does not compare. The Rust `not_utf8`
kind has no TypeScript counterpart and no case.
