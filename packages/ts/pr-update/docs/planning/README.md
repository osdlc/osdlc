# pr-update planning

Why `@osdlc/pr-update` has the shape it has. The [README](../../README.md)
says how to use the package. This folder says why.

These files are maintained here, in
[osdlc/osdlc](https://github.com/osdlc/osdlc). Open an issue or a pull request
there.

## Layout

| Folder                     | Holds                                         | Ids      |
| -------------------------- | --------------------------------------------- | -------- |
| [`decisions/`](decisions/) | Choices that shape the package, one per topic | `D-nnnn` |
| [`backlog/`](backlog/)     | Ideas not yet scheduled                       | `B-nnnn` |

Ids are numbers in order of writing, zero-padded to four digits so they sort.
They are never reused.

## Decisions

- [D-0001](decisions/D-0001-engine-hosts-and-one-judgement-seam.md): pr-update
  is a host-neutral update engine with one judgement seam
- [D-0002](decisions/D-0002-restack-a-whole-stack-in-one-run.md): restack a
  whole stack in one run, opt-in
- [D-0003](decisions/D-0003-survey-and-update-on-the-command-model.md): survey
  and update run on cli-tool's command model
- [D-0004](decisions/D-0004-update-repositories-in-parallel-with-jobs.md): update
  repositories in parallel with `--jobs`, one child process per repository
- [D-0005](decisions/D-0005-managed-bare-mirror-checkout.md): run without a
  local checkout from a managed bare clone

## Backlog

- [B-0001](backlog/B-0001-route-the-repair-agent-through-model-routing-profiles.md):
  Route the repair agent through model-routing profiles
- [B-0002](backlog/B-0002-a-mirror-only-checkout-value.md): A "mirror only"
  checkout value
- [B-0003](backlog/B-0003-require-git-ref-attempts-for-mirror-targets.md):
  Require `git-ref` attempts for mirror targets
