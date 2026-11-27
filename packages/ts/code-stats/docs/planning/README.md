# code-stats planning

Why `@osdlc/code-stats` has the shape it has, and the work still open on it. The
[README](../../README.md) says how to use the package.

These files are maintained in [osdlc/osdlc](https://github.com/osdlc/osdlc). Open an issue or a
pull request there.

## Layout

| Folder                     | Holds                                         | Ids      |
| -------------------------- | --------------------------------------------- | -------- |
| [`decisions/`](decisions/) | Choices that shape the package, one per topic | `D-xxxx` |
| [`tasks/`](tasks/)         | Work, open or done                            | `T-nn`   |

A decision id is `D-` and four random characters, and a task id is `T-` and a number in order of
writing. Ids are never reused. Entries link to each other with relative links.

Each entry has a `state`. A decision is `proposed`, `accepted` or `superseded`; a superseded
decision names the one that replaces it. A task is `open` or `done`.

## Decisions

- [D-F5NA](decisions/D-F5NA-fold-review-prep-into-code-stats.md): Review prep is a command of
  code-stats (proposed)
- [D-K7CS](decisions/D-K7CS-line-kinds-operations-and-file-groups.md): Lines have a kind and an
  operation, from scc's table and git's own facts
- [D-M4QW](decisions/D-M4QW-name-and-command.md): Name and command (proposed)
- [D-R8TX](decisions/D-R8TX-first-public-api.md): The API of the first public version (proposed)
- [D-J2NB](decisions/D-J2NB-version-line-and-stability.md): Version line and stability (proposed)
- [D-P6HZ](decisions/D-P6HZ-node-only-and-platforms.md): Node only, and the platforms (proposed)
- [D-W3CV](decisions/D-W3CV-package-map-from-system-model.md): The package map reads manifests
  through `@osdlc/system-model`

## Open tasks

- [T-01](tasks/T-01-use-typed-git-and-typed-gh-verbs.md): Read objects, diffs and pull requests
  through the typed verbs
- [T-02](tasks/T-02-windows-tier-2.md): Run the tests on Windows
- [T-03](tasks/T-03-import-the-library-without-the-command-framework.md): Import the library
  without the command framework
- [T-04](tasks/T-04-share-the-even-split-rule.md): One copy of the even-split rule
- [T-05](tasks/T-05-export-the-command-app.md): Export the command app
