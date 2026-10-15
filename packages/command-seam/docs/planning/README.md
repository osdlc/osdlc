# command-seam planning

Why `@sksizer/command-seam` has the shape it has, and what is still open.
The [README](../../README.md) says how to use the package. This folder says
why.

These files are maintained in the maintainer's development repository and
copied here with each release. A change made here directly is replaced by the
next release. Open an issue or a pull request, and the maintainer ports
accepted changes.

## Layout

| Folder                     | Holds                                         | Ids    |
| -------------------------- | --------------------------------------------- | ------ |
| [`decisions/`](decisions/) | Choices that shape the package, one per topic | `D-nn` |
| [`tasks/`](tasks/)         | Work still open after the first release       | `T-nn` |
| [`notes/`](notes/)         | Design notes                                  | `N-nn` |

Ids are numbers in order of writing, zero-padded to two digits so they sort.
They are never reused. Entries link to each other with relative links.

Each entry has a `state`. A decision is `accepted` or `superseded`, and a
superseded decision names the one that replaces it. A task is `open` or
`done`. A note is `accepted` while it describes the package as it is, or
`superseded` once it no longer does.

## Decisions

- [D-01](decisions/D-01-purpose-and-scope.md): Purpose and scope
- [D-02](decisions/D-02-version-line-and-stability.md): Version line and
  stability tiers
- [D-03](decisions/D-03-platforms-and-runtimes.md): Platforms and runtimes
- [D-04](decisions/D-04-typescript-consumers.md): TypeScript consumers
- [D-05](decisions/D-05-failures-are-results.md): Failures are results
- [D-06](decisions/D-06-timeouts-and-cancellation.md): Timeouts and
  cancellation
- [D-07](decisions/D-07-process-groups.md): Process groups
- [D-08](decisions/D-08-shell-strings.md): Shell strings
- [D-09](decisions/D-09-helpers.md): Helpers
- [D-10](decisions/D-10-output-is-text.md): Output is text
- [D-11](decisions/D-11-bun-test-capture-path.md): The `bun test` capture
  path
- [D-12](decisions/D-12-tests-and-tooling.md): Tests and tooling
- [D-13](decisions/D-13-docs-and-community-files.md): Docs and community
  files
- [D-14](decisions/D-14-names-without-aliases.md): Names without aliases
- [D-15](decisions/D-15-api-changes-start-from-consumer-code.md): API changes
  start from consumer code

## Open tasks

- [T-01](tasks/T-01-windows-support.md): Windows support
- [T-02](tasks/T-02-vitest.md): Move the tests to Vitest
- [T-03](tasks/T-03-bounded-and-binary-output.md): Bounded and binary output

## Notes

- [N-01](notes/N-01-the-runner-seam.md): The runner seam
