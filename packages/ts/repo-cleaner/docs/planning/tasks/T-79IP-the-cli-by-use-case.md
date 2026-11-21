---
id: T-79IP
type: task
state: done
created: 2026-11-20
---

# T-79IP: The command line by phase, scope and remote

## Goal

Build the command line [D-4CE9](../decisions/D-4CE9-the-cli-by-use-case.md)
designs from its use cases: named phases, scope flags, several remotes judged
each against its own default branch, a fork's pull requests read from its
parent, `--fetch`, `--pick` that adds rows, `--spare` globs and `clean -i`.
The README's recipes are the use cases, and each runs in a test.

## Spec

D-4CE9 is the spec, with its "Decided at implementation" section;
[terms.md](../terms.md) fixes the words.

## Outcome

Shipped in [#968](https://github.com/osdlc/osdlc/pull/968), with
`@osdlc/cli-tool`'s `valueAfterEquals` flag and `askChecklist` prompt and
`@osdlc/typed-gh`'s `PullRequest.headRepositoryOwner`.

- Phases `status`, `plan`, `clean`, `cache`; the bare command explains them
  and exits 2.
- Scope `--local`, `--remote[=<name>]`, `--all`, `--worktrees`, `--branches`;
  `--remote upstream` with a space is refused with the fix.
- Each remote in scope is fetched and judged against its own default branch;
  `--against` judges every row against one remote's. Every judged row records
  `evidence.landedAgainst`, part of its fingerprint. Plans are version 3.
- A fork's pull requests are read from its parent.
- `--pick` adds a row; the library's `select` names rows exactly. `--spare`
  takes a glob, and a bare name spares that branch everywhere.
- `clean -i` chooses rows from a checklist and asks for each risk by name.
- `tests/recipes.test.ts` runs every `$ repo-cleaner` line of the README's
  Recipes section.

Later, [#936](https://github.com/osdlc/osdlc/pull/936) added `status --sizes`
and the space `clean` freed.
