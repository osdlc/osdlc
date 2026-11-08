# file-lock

Cross-process exclusive file locks on one on-disk protocol, so a Node.js
process and a Rust process can hold one lock file in turn. A claim
hard-links a fully written JSON file into place, a stale lock is taken over
through a marker named from a hash of its text, and release, touch and
rewrite act only while the lock holds the claim's token.
[SPEC.md](SPEC.md) states the protocol.

| Implementation                 | Language   | Directory                       |
| ------------------------------ | ---------- | ------------------------------- |
| `@osdlc/file-lock` (reference) | TypeScript | `packages/ts/file-lock`         |
| `osdlc-file-lock`              | Rust       | `packages/rust/osdlc-file-lock` |

`suite.json` holds the cases. Each case runs in a fresh directory that
holds the lock `x.lock`:

- `lock` is the file there before the case runs: its text (`raw`, a string,
  or `{ "hex": ... }` for bytes that are not UTF-8) and how long ago it was
  last modified (`ageMs`). `null` means no lock.
- `markers` lists texts whose takeover marker is there before the case runs,
  as if another reaper were taking over a lock with that text.
- A held lock is judged stale once untouched for more than `staleMs`.

Each result records the lock afterwards: `null` when it is gone, otherwise
its parsed content (`null` when it is not lock content), with the case's own
claim token shown as `<ours>`, whether its text is unchanged, and whether its
mtime is under 5 s old. `beside` lists every other name left in the
directory, so a temp file or marker left behind fails the case.

The suite cannot age a marker: its age is the inode's ctime, which no call
sets. Each implementation's own tests cover a marker left by a dead reaper.

Write a new case's `input` by hand, then run

```sh
pnpm --filter @osdlc/file-lock conformance:write
```

on Linux or macOS to write its `expect` or `error`. Never write those by hand.

The TypeScript package's `tests/interop.test.ts` also runs Node.js and Rust
processes against one lock at once, when the crate's `interop-counter`
example is built.

Each implementation's README lists what it has that the other does not.
