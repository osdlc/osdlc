# Standards

Each standard names a rule and how it is enforced: the script that checks it
and the command that runs the script, or review where no script can check it.

| Standard                                         | Rule                                                    | Command                   |
| ------------------------------------------------ | ------------------------------------------------------- | ------------------------- |
| [S-0001](./S-0001-package-shape-ts.md)           | The shape of a TypeScript library in `packages/ts/`     | `pnpm run check:packages` |
| [S-0002](./S-0002-package-shape-rs.md)           | The shape of a Rust crate in `packages/rust/`           | `pnpm run check:crates`   |
| [S-0003](./S-0003-document-features-as-added.md) | A feature is documented in its library when it is added | review                    |

The enforcing scripts live in [`scripts/`](../../../scripts/).
