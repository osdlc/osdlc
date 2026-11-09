# agent-router planning

Why `@osdlc/agent-router` has the shape it has, the work still open on it, and the words it uses
with a fixed meaning. The [README](../../README.md) says how to use the package.

These files are maintained in [osdlc/osdlc](https://github.com/osdlc/osdlc). Open an issue or a
pull request there. The Rust twin, the `agent-router` crate, points here for the decisions both
share.

## Layout

| Folder                     | Holds                                         | Ids     |
| -------------------------- | --------------------------------------------- | ------- |
| [`decisions/`](decisions/) | Choices that shape the package, one per topic | `D-nn`  |
| [`tasks/`](tasks/)         | Work, open or done                            | `T-nn`  |
| [`terms/`](terms/)         | Words the docs use with a fixed meaning       | `TM-nn` |

Ids are numbers in order of writing, zero-padded to two digits so they sort. They are never
reused. Entries link to each other with relative links.

Each entry has a `state`. A decision is `proposed`, `accepted` or `superseded`; a superseded
decision names the one that replaces it. A task is `open` or `done`. A term is `accepted`, or
`superseded` once it no longer describes the package.

## Decisions

- [D-01](decisions/D-01-name-and-scope.md): Name and scope
- [D-02](decisions/D-02-version-line-and-stability.md): Version line and stability
- [D-03](decisions/D-03-input-is-checked-before-launch.md): Input is checked before it reaches a
  launch
- [D-04](decisions/D-04-result-type.md): The `Result` type
- [D-05](decisions/D-05-twin-and-shared-vectors.md): The Rust twin and the shared vectors
- [D-06](decisions/D-06-catalogue-mapping-table-and-resolver.md): A model catalogue, a mapping
  table and a resolver

## Open tasks

- [T-02](tasks/T-02-configurable-effort-mismatch-policy.md): A configurable effort-mismatch
  policy
- [T-03](tasks/T-03-config-sections-take-meta-from-the-host.md): The config sections take their
  meta from the host
- [T-04](tasks/T-04-availability-in-the-package.md): The availability check in the package
- [T-05](tasks/T-05-vectors-into-the-conformance-suites.md): The shared vectors move into the
  conformance suites

## Done tasks

- [T-01](tasks/T-01-pi-effort-words.md): The catalogue speaks one set of effort words

## Terms

- [TM-01](terms/TM-01-agent-router.md): Agent router
- [TM-02](terms/TM-02-tool.md): Tool
- [TM-03](terms/TM-03-provider.md): Provider
- [TM-04](terms/TM-04-reference.md): Reference
- [TM-05](terms/TM-05-profile.md): Profile
- [TM-06](terms/TM-06-tier.md): Tier
- [TM-07](terms/TM-07-effort.md): Effort
