# web-access planning

Why the `web-access` crate has the shape it has, and the work still open on
it. The [README](../../README.md) says how to use the crate.

These files are maintained here, in
[osdlc/osdlc](https://github.com/osdlc/osdlc). Open an issue or a pull request
there.

## Layout

| Folder                     | Holds                                       | Ids    |
| -------------------------- | ------------------------------------------- | ------ |
| [`decisions/`](decisions/) | Choices that shape the crate, one per topic | `D-nn` |
| [`tasks/`](tasks/)         | Work, open or done                          | `T-nn` |

Ids are numbers in order of writing, zero-padded to two digits so they sort.
They are never reused. Entries link to each other with relative links.

Each entry has a `state`. A decision is `proposed`, `accepted` or
`superseded`. A superseded decision names the one that replaces it. A task is
`open` or `done`.

## Decisions

- [D-01](decisions/D-01-name-scope-and-home.md): Name, scope and home
- [D-02](decisions/D-02-version-line-and-stability.md): Version line and
  stability
- [D-03](decisions/D-03-grants-and-access-contexts.md): Grants and access
  contexts
- [D-04](decisions/D-04-token-transport.md): How the token travels
- [D-05](decisions/D-05-host-and-origin-checks.md): Host and Origin checks
- [D-06](decisions/D-06-platforms-runtimes-and-licence.md): Platforms,
  runtimes and licence

## Open tasks

- [T-01](tasks/T-01-encrypted-transport.md): Serve over an encrypted
  connection
- [T-02](tasks/T-02-per-device-tokens.md): Per-device tokens that can be
  revoked
- [T-03](tasks/T-03-end-connections-when-a-grant-is-withdrawn.md): End open
  connections when a grant is withdrawn
- [T-04](tasks/T-04-session-cookie.md): A per-browser session in the cookie,
  not the token
- [T-05](tasks/T-05-serve-and-runtime-edge-cases.md): Edge cases in `serve`
  and the sharing runtime
- [T-06](tasks/T-06-guard-edge-cases.md): Edge cases in the guard
- [T-07](tasks/T-07-token-file-hardening.md): Harden the token files
- [T-08](tasks/T-08-limit-failed-token-attempts.md): Limit failed token
  attempts
