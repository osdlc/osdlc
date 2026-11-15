---
id: TM-07
type: term
state: accepted
created: 2026-11-07
---

# TM-07: Effort

## Definition

How much reasoning a model is asked to spend on a launch: `none`, `minimal`, `low`, `medium`,
`high`, `xhigh` or `max` (`EFFORT_LEVELS` from `@osdlc/agent-call/models`), where the tool and model
accept it. It is the part after `@` in a [reference](TM-04-reference.md) (`codex/max@high`).

## Contrast

Not a [tier](TM-06-tier.md). The tier picks which model runs; effort tunes that model.

Not a cost or budget setting, though more effort usually costs more.

## Notes

An effort the tool and model do not accept moves one step on that scale, up first, then down, and
the move is traced and warned. One more than a step from every accepted level is an error, and so
is a word that is not a level at all ([D-03](../decisions/D-03-input-is-checked-before-launch.md)).
