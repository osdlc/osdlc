# markdown-vault planning

Why `@osdlc/markdown-vault` has the shape it has, and the work still open on it. The
[README](../../README.md) says how to use the package.

These files are maintained in [osdlc/osdlc](https://github.com/osdlc/osdlc). Open an issue or a
pull request there. The package began in sksizer/dev, a private repository.

## Layout

| Folder                     | Holds                                         | Ids    |
| -------------------------- | --------------------------------------------- | ------ |
| [`decisions/`](decisions/) | Choices that shape the package, one per topic | `D-nn` |
| [`tasks/`](tasks/)         | Work, open or done                            | `T-nn` |

Ids are numbers in order of writing, zero-padded to two digits so they sort. They are never
reused. Entries link to each other with relative links.

Each entry has a `state`. A decision is `proposed`, `accepted` or `superseded`; a superseded
decision names the one that replaces it. A task is `open` or `done`.

## Decisions

- [D-01](decisions/D-01-name.md): The name (proposed)
- [D-02](decisions/D-02-api-for-the-first-release.md): The API for the first release (proposed)
- [D-03](decisions/D-03-version-line-and-stability.md): Version line and stability
- [D-04](decisions/D-04-planned-corpus-model.md): The planned corpus model
- [D-05](decisions/D-05-link-resolution.md): Link resolution
- [D-06](decisions/D-06-what-the-walk-skips.md): What the walk skips
- [D-07](decisions/D-07-symlink-policy.md): The symlink policy
- [D-08](decisions/D-08-one-normalisation.md): One normalisation for `scanVault` and
  `createVaultIndex`

## Open tasks

- [T-01](tasks/T-01-opt-out-of-following-symlinks.md): An option to not follow symlinks out of
  the vault
- [T-02](tasks/T-02-test-on-windows.md): Test on Windows
- [T-03](tasks/T-03-fold-into-the-corpus-model.md): Fold the package into the corpus model
