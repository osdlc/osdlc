# config-layers

A tool's project and machine config files: what counts as a set value,
dotted-key lookup, how a YAML file reads as a config mapping, how a path
value resolves (`~`, relative paths), the `{name}` substitution from the
`paths:` map and its error text, and the message a command gives for a
setting it needs that is not set.

| Implementation | Language | Directory |
|---|---|---|
| `@osdlc/config-layers` (reference) | TypeScript | `packages/ts/config-layers` |
| `config-layers` | Rust | `packages/rust/config-layers` |

`suite.json` holds the cases. Each section's `description` says what a case
gives and takes. Write a new case's `input` by hand, then run

```sh
pnpm --filter @osdlc/config-layers conformance:write
```

on Linux or macOS to write its `expect` or `error`. Never write those by hand.
The path, substitution and need cases use POSIX paths, so they run on Unix
only.

The Rust crate is the smaller of the two, and the suite covers only what both
do. The TypeScript package's README, in its "The Rust crate" section, lists
the differences: the zod schemas, sections and loader the crate has no
counterpart for, and the YAML values the two read differently. The Rust
crate's README lists what only it has.

## Known divergences

These are left out of the suite until the family settles them:

- A leading-zero integer such as `017` reads as the number 17 in TypeScript
  and as the float 17.0 in Rust.
- `1_000` and `0b11` read as strings in TypeScript and as numbers in Rust.
- `1e999` reads as the string `1e999` in TypeScript and as `.inf` in Rust.
- `!!float 1` and an unknown tag such as `!custom 6` read as strings in
  TypeScript and as numbers in Rust.
- An integer beyond 2^53 loses precision in TypeScript, and one beyond
  `u64` reads as a lossy float in Rust.
