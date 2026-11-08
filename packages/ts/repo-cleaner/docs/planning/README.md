# repo-cleaner planning

Why `@osdlc/repo-cleaner` has the shape it has, and what is still open. The
[README](../../README.md) says how to use the package. This folder says why.

These files are maintained here, in
[osdlc/osdlc](https://github.com/osdlc/osdlc). Open an issue or a pull request
there. Decisions that span repo-cleaner and other packages, such as
[D-L7N5](../../../../../docs/decisions/D-L7N5-host-cleaner.md) for host-cleaner,
are in the root [`docs/decisions/`](../../../../../docs/decisions/README.md).

## Layout

| Folder                     | Holds                                         | Ids              |
| -------------------------- | --------------------------------------------- | ---------------- |
| [`decisions/`](decisions/) | Choices that shape the package, one per topic | random, `D-XXXX` |
| [`tasks/`](tasks/)         | Work on the package, open or done             | random, `T-XXXX` |

Ids are random keys, so parallel branches do not collide. A record that
started in sksizer/dev keeps the id it had there. Each decision has a `state`:
`accepted` or `superseded`. A superseded decision names the one that replaces
it. A task is `open` or `done`. An open task names the issue that holds its
spec and discussion; when that issue closes, the task becomes `done` and says
what shipped.

## Decisions

- [D-RSWP](decisions/D-RSWP-standalone.md): repo-cleaner is a standalone tool;
  a host adds what it knows through `annotate`
- [D-UVUH](decisions/D-UVUH-failed-lookups.md): a failed lookup costs its
  evidence; a failed fetch costs the repository

## Open tasks

- [T-C665](tasks/T-C665-remote-contained-worktree.md): a clean worktree whose
  HEAD is on a remote branch can be removed
  ([#659](https://github.com/osdlc/osdlc/issues/659))
- [T-602K](tasks/T-602K-sizes-and-ranking.md): report each worktree's disk
  size and the total a clean would free
  ([#660](https://github.com/osdlc/osdlc/issues/660))
- [T-R61B](tasks/T-R61B-archive-before-delete.md): archive unlanded work to
  the remote before clean deletes it
  ([#661](https://github.com/osdlc/osdlc/issues/661))
- [T-95L2](tasks/T-95L2-open-prs-beyond-the-listing-cap.md): open PRs older
  than the newest 300 are not missed
  ([#677](https://github.com/osdlc/osdlc/issues/677))
- [T-DEZH](tasks/T-DEZH-fork-pull-requests.md): in a fork, PRs are listed for
  the swept remote ([#678](https://github.com/osdlc/osdlc/issues/678))
- [T-FZEU](tasks/T-FZEU-utc-safe-process-probe.md): the process probe
  compares start times in UTC
  ([#679](https://github.com/osdlc/osdlc/issues/679))
- [T-INEW](tasks/T-INEW-bare-invocation-from-a-subdirectory.md): run with no
  target from a subdirectory, sweep the checkout around it
  ([#680](https://github.com/osdlc/osdlc/issues/680))

## Done tasks

- [T-DUYG](tasks/T-DUYG-worktree-lock-liveness.md): a worktree lock held by a
  dead process no longer blocks removal
  ([#499](https://github.com/osdlc/osdlc/pull/499))
- [T-9HB4](tasks/T-9HB4-patch-equivalence-landing.md): detect squash- and
  rebase-merged branches by patch equivalence
  ([#501](https://github.com/osdlc/osdlc/pull/501))
