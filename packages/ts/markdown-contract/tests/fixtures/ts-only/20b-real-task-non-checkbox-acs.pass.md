---
type: task
id: T-132J
status: planning/backlog
impact: low
complexity: small
---
# Document or auto-create destination parent dir for git worktree move

## Goal

`git worktree move <src> <dst>` fails if `<dst>`'s parent dir is missing.

## Files to touch

| Location                        | Kind   | Change                 |
| ------------------------------- | ------ | ---------------------- |
| `plugin/conventions/worktree.md`| modify | note the prerequisite  |
| `plugin/scripts/relocate.sh`    | add    | parent-creating wrapper|

## Acceptance criteria

- [ ] Every `git worktree move` in `plugin/` prose creates its parent dir first
- [ ] A grep for raw `git worktree move` returns zero un-annotated invocations