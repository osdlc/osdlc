---
id: TM-05
type: term
state: accepted
created: 2026-11-07
---

# TM-05: Profile

## Definition

A named, ordered list of [references](TM-04-reference.md) that the
[agent router](TM-01-agent-router.md) tries in turn, taking the first that can run. Two are built
in, `default` (`*/standard`) and `small` (`*/fast`).

## Contrast

Not a single [reference](TM-04-reference.md). A binding names either one profile or one reference
(`tool`), never both.

Not a user or host profile. It is a list of tool choices, nothing more.

## Notes

The long form adds `host` and `context`. The author rule is not part of a profile: the caller
passes it with the walk.
