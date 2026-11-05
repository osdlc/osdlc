---
id: D-03
type: decision
state: accepted
created: 2026-11-05
---

# D-03: Byte output through `rawBytes`

## Decision

This revisits item 5 of the enhancements in
[D-01](D-01-first-release-api-review.md), which declined byte output for the
first release. Issue [#383](https://github.com/osdlc/osdlc/issues/383) asked
again.

1. Byte output: adopted as two escape hatches, `rawBytes` and
   `rawBytesChecked`, on both clients. They take argv as `raw` does and return
   a `CommandResult<Buffer>`: stdout as the bytes git wrote, stderr as text.
   `rawBytesChecked` fails as `rawChecked` does, on a non-zero exit, a run that
   never exited, or output cut short. No verb returns bytes.
2. A second runner: `Git` takes `bytesRunner` (a `BytesCommandRunner`) and
   `cliBackend` takes `bytesRunner` (an `AsyncBytesCommandRunner`). Without a
   `runner`, each defaults to command-seam's bytes runner on absolute `PATH`
   entries, the same rule as the text runner.
3. A client given a `runner` and no `bytesRunner` throws, or rejects with,
   `UnsupportedRequest` from `rawBytes`. It does not fall back to a default
   spawn.
4. The backend seam gets one request kind, `rawBytes`, with the same fields
   as `raw`. A non-CLI backend rejects it through `partialBackend`, as it
   rejects `raw`.
5. `rawBytes`, `rawBytesChecked` and `bytesRunner` are experimental, because
   command-seam's bytes runners are.
6. Byte input: still declined. `input` stays a string on every call,
   `rawBytes` too.
7. Two verb options land with it: `statusEntries({ ignored })` adds
   `--ignored`, and `diffText({ binary })` adds `--binary`.

## Why

- D-01 declined bytes because they need a second runner on `Git` and
  `cliBackend`, and a request kind a non-CLI backend would have to serve.
  Both costs are smaller than they looked. The second runner is an optional
  field with a default. The request kind is one more `raw`, which a non-CLI
  backend already rejects. `partialBackend` rejects it with no code from the
  backend author.
- Callers that hash or replay git output (`status -z --ignored`,
  `diff --cached --binary`, a blob) cannot do it through `raw`: decoding
  replaces bytes that are not UTF-8 with U+FFFD, and the result does not
  say it happened. Without this, they build a second runner and repeat the
  client's `--git-dir`, `env` and failure handling by hand.
- Escape hatches, not verbs. A verb returns parsed values, and its parser
  reads text. Bytes are for output the caller does not want parsed, so the
  `raw` shape fits. A verb can take a bytes form later if one has a parser
  worth sharing.
- No silent fallback. A caller that injects a `runner` does so to control
  every spawn: a fake in a test, a sandbox, a remote shell. Defaulting the
  bytes runner there would run real git behind that runner's back. Refusing
  makes the gap visible the first time `rawBytes` is called.
- Byte input needs command-seam to take `input` as bytes. Widening
  `CommandRunOptions.input` to `string | Uint8Array` changes the type every
  `CommandRunner` implementation reads, so a fake that treats `input` as a
  string stops compiling. typed-gh's own tests do that. A separate field is
  the other choice. Either is a command-seam decision, not this package's.
- `ignored` and `binary` are flags on existing verbs. They need no new
  runner. `--binary` output is ASCII, so `diffText` returns it intact.

## Consequences

- A test that injects a fake `runner` and calls `rawBytes` must inject a
  fake `bytesRunner` too.
- A backend written as an exhaustive switch over `GitRequest` gets a new
  kind. The seam is experimental, so this is allowed in a minor release.
- `statusEntries` and `diffText` requests carry an optional field. A
  backend that ignores it answers without ignored files and without binary
  patches.
- `diffText` still decodes. A text file whose lines are not UTF-8 needs
  `rawBytesChecked` to keep its patch exact.
- Replaying a patch read with `rawBytes` through stdin waits for byte
  `input`. Until then the caller writes it to a file and runs `git apply
  <file>`.
- The Rust twin already returns bytes (`GitCommand::run_raw`) and takes
  bytes on stdin, so it needs no follow-up.
