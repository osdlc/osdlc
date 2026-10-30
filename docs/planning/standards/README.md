# Standards

Each standard names a rule, the script that enforces it, and the command that
runs the script. A rule with no script does not belong here.

A standard's file is `S-<slug>.md`, and the name is its identifier: link to it
as `S-<slug>`. The slug is chosen when the standard is written and does not
change afterwards. Standards are not numbered. A number would only record the
order they were written in, and that order says nothing about how they relate.

| Standard | Rule | Command |
| --- | --- | --- |
| [S-package-shape-ts](./S-package-shape-ts.md) | The shape of a TypeScript library in `packages/ts/` | `pnpm run check:packages` |
| [S-package-shape-rs](./S-package-shape-rs.md) | The shape of a Rust crate in `packages/rust/` | `pnpm run check:crates` |
| [S-conformance-suites](./S-conformance-suites.md) | A library family's implementations share one conformance suite | `pnpm run check:conformance` |

The enforcing scripts live in [`scripts/`](../../../scripts/).
