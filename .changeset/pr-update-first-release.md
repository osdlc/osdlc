---
'@osdlc/pr-update': minor
---

First public release. `@osdlc/pr-update` is a standalone tool and library that brings pull-request branches up to date with their base, one PR or a whole stack. It moves here from the development repository, where it was `@sksizer/pr-update`.

- `pr-update`: a CLI with a survey step (drift measured locally, conflicts predicted with `git merge-tree`, PRs read through `@osdlc/code-host`) and an update step that rebases and falls back to a merge when the rebase cannot finish.
- A conflict ladder: `git rerere`, lockfile regeneration, configured resolvers and generators, then the repair port.
- The repair port runs a command or a built-in headless agent preset (`claude`, `codex`, `cursor`, `pi`) through `@osdlc/agent-call`.
- `--branch` updates the PR whose head is the checked-out (or named) branch, `--pr` picks one PR (with its stack parents), and `--report` writes the run as JSON.
- Settings live in a `pr-update.yaml` config file, read through `@osdlc/config-layers`. Commands that come from a repository's own config run only after the repository is trusted, through `@osdlc/trust-repo`.
- A host-neutral engine API: `runSurvey`, `runUpdate` and the `Ports` they take.
- Depends on `@osdlc/agent-call`, `@osdlc/cli-tool`, `@osdlc/code-host`, `@osdlc/command-seam`, `@osdlc/config-layers`, `@osdlc/etag-write`, `@osdlc/trust-repo`, `@osdlc/typed-git`, `yaml` and `zod`. ESM with `.d.ts` types, for Node 22.18 or newer. Licence `MIT OR Apache-2.0`.
