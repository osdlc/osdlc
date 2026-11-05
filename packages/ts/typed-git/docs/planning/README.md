# typed-git planning

Why `@osdlc/typed-git` has the shape it has. The [README](../../README.md)
says how to use the package. This folder says why.

These files are maintained here, in
[osdlc/osdlc](https://github.com/osdlc/osdlc). Open an issue or a pull request
there.

## Layout

| Folder                     | Holds                                         | Ids    |
| -------------------------- | --------------------------------------------- | ------ |
| [`decisions/`](decisions/) | Choices that shape the package, one per topic | `D-nn` |

Ids are numbers in order of writing, zero-padded to two digits so they sort.
They are never reused. Each decision has a `state`: `accepted` or
`superseded`. A superseded decision names the one that replaces it.

## Decisions

- [D-01](decisions/D-01-first-release-api-review.md): First release API review
- [D-02](decisions/D-02-git-failure-is-a-result.md): `try` returns a
  `Result<T, GitFailure>`
- [D-03](decisions/D-03-byte-output.md): Byte output through `rawBytes`

## Follow-ups

Declined or deferred for now. Each names the decision that says why.

- Mark `rawBytes`, `rawBytesChecked` and `bytesRunner` stable when
  command-seam's bytes runners are. See
  [D-03](decisions/D-03-byte-output.md).
- Streamed output for `clone`, `fetch` and `rebase` progress: needs a seam
  runner that both streams and captures. See
  [D-01](decisions/D-01-first-release-api-review.md).
- Binary `input` for `raw`, `rawChecked` and `rawBytes`: command-seam takes
  `input` as a string, and taking bytes is a change to every
  `CommandRunner`. See [D-03](decisions/D-03-byte-output.md).
- Remove the deprecated `remote()` alias in the next minor release. The
  [no-legacy-APIs rule](../../../../README.md#breaking-changes) allows no
  deprecated alias across a breaking version, and the README's "removed at 1.0"
  line must change with it. Unless the owner records an override that says why
  and when it goes, the change lists `remote()` and its replacement `remotes()`
  in the release notes.
