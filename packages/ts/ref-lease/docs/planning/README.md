# ref-lease planning

Why `@osdlc/ref-lease` has the shape it has. The [README](../../README.md) says how to use the
package. This folder says why. [git-mechanics.md](../guide/git-mechanics.md) explains the git model the
protocol rests on, for readers new to refs.

## Layout

| Folder | Holds | Ids |
|---|---|---|
| [`decisions/`](decisions/) | Choices that shape the package, one per topic | `D-nn` |

Ids are numbers in order of writing, zero-padded to two digits so they sort. They are never
reused. Each decision has a `state`: `accepted` or `superseded`. A superseded decision names the
one that replaces it.

## Decisions

- [D-01](decisions/D-01-five-ref-operations.md): Five ref operations over `--force-with-lease`
- [D-02](decisions/D-02-one-ref-per-lease.md): One ref per lease, outside `refs/heads/`
- [D-03](decisions/D-03-authority-is-any-git-remote.md): The authority is any git remote
- [D-04](decisions/D-04-payload-is-the-callers.md): The payload is the caller's
- [D-05](decisions/D-05-errors-carry-a-kind.md): Errors are classes with a stable `kind`
- [D-06](decisions/D-06-namespace-guard.md): The namespace guard
