# rule-review planning

Why `@osdlc/rule-review` has the shape it has, and the work still open. The
[README](../../README.md) says how to use the package.

These files are maintained here, in
[osdlc/osdlc](https://github.com/osdlc/osdlc). Open an issue or a pull request
there.

## Layout

| Folder                     | Holds                                         | Ids    |
| -------------------------- | --------------------------------------------- | ------ |
| [`decisions/`](decisions/) | Choices that shape the package, one per topic | `D-nn` |
| [`tasks/`](tasks/)         | Work, open or done                            | `T-nn` |

Ids are numbers in order of writing, zero-padded to two digits so they sort.
They are never reused. Entries link to each other with relative links.

Each entry has a `state`. A decision is `proposed`, `accepted` or
`superseded`. A task is `open` or `done`.

## Decisions

- [D-01](decisions/D-01-name.md): Package and command name
- [D-02](decisions/D-02-version-line-and-stability.md): Version line and
  stability
- [D-03](decisions/D-03-runtimes-platforms-and-contents.md): Runtimes,
  platforms and package contents
- [D-04](decisions/D-04-one-built-in-provider.md): One built-in rule provider
- [D-05](decisions/D-05-selection-by-scope.md): Selection by scope
  intersection
- [D-06](decisions/D-06-advisory-by-default.md): Advisory by default; an
  incomplete run fails only with `--strict`
- [D-07](decisions/D-07-check-folders.md): Check folders
- [D-08](decisions/D-08-licence.md): Licence

## Open tasks

- [T-01](tasks/T-01-prompt-checks.md): Run prompt checks
- [T-02](tasks/T-02-same-prefix-concurrency-and-fail-fast.md): Same-prefix
  concurrency and fail-fast
- [T-03](tasks/T-03-review-the-staged-content.md): Review the staged content

## Done tasks

- [T-04](tasks/T-04-default-base-without-origin.md): `defaultBase` without
  `origin/HEAD`
- [T-05](tasks/T-05-fixture-modes.md): Guard the fixture scripts' executable
  bit
