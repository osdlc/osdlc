---
id: D-01
type: decision
state: accepted
created: 2026-10-20
---

# D-01: First release API review

## Decision

The owner answered 22 questions from the readiness review of the package,
before its first release as `@osdlc/typed-git`. CI published 0.5.0 from the
moved code before these answers were applied. They ship in 0.5.1.

1. API gate: approved for 0.5.x.
2. Name: `@osdlc/typed-git` is signed off.
3. Versions: the TypeScript and Rust twins keep the same major and minor
   version. Both are on 0.5.
4. Licence: `MIT OR Apache-2.0`, with `LICENSE-MIT` and `LICENSE-APACHE`.
5. Platforms: macOS, Linux and Windows. CI runs Linux and macOS. Windows is
   not tested in CI yet.
6. Internal exports: `gate` and `GitVerb` are no longer exported.
   `REF_FORMAT` and `parseRefRows` stay.
7. Missing types: `StatusEntry`, `CleanOptions`, `DiffCheckOptions`,
   `DiffCheckResult` and `CommitFlags` are exported.
8. `diffText` and `diffAddedFile` follow the failure contract. A failure
   throws. Both take call options, and so does `revParse`.
9. `soft.configRemoveSection` is removed.
10. The `./client` subpath stays. The README and its header list what it
    leaves out.
11. A ref, remote, URL, path, ref pattern or config key argument that starts
    with `-` is refused with a `TypeError` before git runs. 38 verbs check it.
    `grep` passes its pattern with `-e` instead, so such a pattern is searched
    for.
12. `@osdlc/command-seam` is a dependency at the current npm minor. The range
    is raised with each seam minor. Inside this repository it is
    `workspace:^`.
13. `merge`, `rebase` and `rebaseContinue` run with `LC_ALL=C`.
14. `parseRemoteUrl` keeps reading `group/sub/repo` as owner `sub`, and keeps
    dropping the `ssh://` port. The README says so.
15. The backend seam (`GitBackend`, `GitRequest`, `GitResults`,
    `partialBackend`) is experimental.
16. `engines.node` matches the dependency `hosted-git-info`:
    `^22.22.2 || ^24.15.0 || >=26.0.0`.
17. `push` keeps `forceWithLease: true`. The README documents it as the unsafe
    form and shows the pinned `{ ref, expect }`.
18. `remotes()` is added. `remote()` stays as a deprecated alias, removed at
    1.0.
19. `makeBareAndWorker().cleanup()` keeps deleting a `parent` the caller
    passed in. The option and the result type carry a warning.
20. The `IDENTITY` doc is narrowed to say what is isolated. The fixture does
    not pin `GIT_CONFIG_GLOBAL` or `GIT_CONFIG_NOSYSTEM`.
21. `checkoutSide` with an empty path list does nothing.
22. The minimum git version is the oldest version CI verifies.

## Why

The review found a command-execution bug from leading-dash arguments, calls
that read a failure as "no diff", and README claims that did not match the
code. These answers settle each one. Where a change would break a caller, the
owner chose the safe behaviour and listed the callers to update.

## Consequences

- CI does not pin a git version. The README names the runners' git as the
  tested minimum: 2.55.0 on Ubuntu and 2.56.0 on macOS on 2026-10-20. The
  minimum moves when the runners update git.
- The Windows claim has no test behind it until a Windows CI job exists.
- Callers that read `""` from `diffText` or
  `diffAddedFile` as "no diff", and any `checkout('-')` or `merge('-')`, change
  with the release.
