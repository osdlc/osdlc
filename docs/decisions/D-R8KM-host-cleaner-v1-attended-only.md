# D-R8KM: host-cleaner's first version runs only when a person runs it

Accepted 2026-11-22 with [the host-cleaner plan](../planning/host-cleaner-plan.md),
which puts scheduled and unattended runs out of scope. Supersedes the
unattended subset and launchd scheduling in
[D-L7N5](D-L7N5-host-cleaner.md) and in
[D-H3QW](D-H3QW-host-cleaner-plugin-model.md), which kept them, and D-L7N5's
`claude-code` adapter.

## Question

Does the first version build the unattended subset, launchd scheduling and the
`claude-code` adapter that D-L7N5 decided?

## Options

- Build them, as D-L7N5 and D-H3QW have it.
- Leave them out and record them in the backlog. Chosen.

## Decision

The first version does not build what D-L7N5 calls the unattended subset
(`--auto`), launchd scheduling, or the `claude-code` adapter and its
`close-session` risk ([#665](https://github.com/osdlc/osdlc/issues/665),
[#666](https://github.com/osdlc/osdlc/issues/666)). They are recorded in
host-cleaner's backlog,
[B-0001](../../packages/ts/host-cleaner/docs/planning/backlog/B-0001-unattended-cleaning.md),
so they can come back.

What still holds of D-L7N5: repo-cleaner's own gaps, the `ProcessProbe`, the
one safety model, and the command seam. How the package is built now is
in [how it works](../../packages/ts/host-cleaner/docs/guide/how-it-works.md).

## Reopen if

Any of the conditions B-0001 lists for bringing a piece back is met.
