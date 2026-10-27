# Standards

Each standard names a rule, the script that enforces it, and the command that
runs the script. A rule with no script does not belong here.

| Standard                                                | Rule                                            | Command                   |
| ------------------------------------------------------- | ----------------------------------------------- | ------------------------- |
| [S-0001](./S-0001-package-shape-ts.md)                  | The shape of a TypeScript library in `packages/ts/` | `pnpm run check:packages` |
| [S-0002](./S-0002-package-shape-rs.md)                  | The shape of a Rust crate in `packages/rust/`   | `pnpm run check:crates`   |
| [S-0004](./S-0004-conformance-suites.md) (proposed) | A library family's implementations share one conformance suite | `pnpm run check:conformance` (to be written) |

The enforcing scripts live in [`scripts/`](../../../scripts/).
