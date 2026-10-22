# typed-gh planning

Why `@osdlc/typed-gh` has the shape it has. The [README](../../README.md)
says how to use the package. This folder says why.

These files are maintained here, in
[osdlc/osdlc](https://github.com/osdlc/osdlc). Open an issue or a pull request
there.

## Layout

| Folder                     | Holds                                         |
| -------------------------- | --------------------------------------------- |
| [`decisions/`](decisions/) | Choices that shape the package, one per topic |

A decision is named for its topic, not numbered. Each has a `state`.

## Decisions

- [The name](decisions/name.md): the name is `@osdlc/typed-gh`
- [Shell out to `gh`](decisions/shell-out-to-gh.md)
- [Three modes](decisions/three-modes.md): query, mutation, raw (superseded)
- [Three doors](decisions/three-doors.md): plain, `try` and `soft`, and the
  `GhFailure` kinds
- [Repo and host as arguments](decisions/repo-and-host-as-arguments.md): the
  client names its repo and host in the argv
- [A total model](decisions/total-model.md): a total pull request model
- [Closed enums](decisions/closed-merge-enums.md): two closed enums
- [Merge head sha](decisions/merge-head-sha.md): a merge names the head it
  judged
- [List truncation](decisions/lists-report-truncation.md): a list says when its
  limit cut it short
- [Runtimes and package contents](decisions/runtimes-and-package-contents.md)
- [First version and API](decisions/first-version-and-api.md): first version
  0.5.0, API signed off
