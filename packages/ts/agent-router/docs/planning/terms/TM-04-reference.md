---
id: TM-04
type: term
state: accepted
created: 2026-11-07
---

# TM-04: Reference

## Definition

A short text that names what to launch: `tool/model[ctx=…]@effort`. Only the
[tool](TM-02-tool.md) is required. The model may be a [tier](TM-06-tier.md) or a model name,
`[ctx=…]` asks for at least that much context, and `@` adds an [effort](TM-07-effort.md).
Examples: `claude/opus`, `codex/max@high`, `pi/ollama/qwen3:4b`, `*/fast[local]`.

## Contrast

Not a [profile](TM-05-profile.md). A reference names one choice; a profile is an ordered list of
references tried in turn.

## Notes

`*` in place of the tool means every tool, and needs a tier: `*/fast[local]` is the fast tier
across every tool, local models only. `parseRef` and `formatRef` read and print one; the README's
References section gives the parsing rules.
