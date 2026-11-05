---
type: Harness Fact
title: "Codex CLI: Duplicate skill names"
description: "Duplicate skill names in Codex CLI, as observed over time."
tags: [skills]
harness: codex
subject: skills/duplicate-names
observations:
  - value: { mention: "a `$name` mention needs exactly one enabled match, else it is skipped silently", other_lookup: first enabled match }
    since: null
    until: null
    observed: "2026-10-01"
    source: codex-repo
    via: skill-naming
    locator: "codex-rs/skills/src/selection.rs:136-150, ext/skills/src/selection.rs:66-73 at 57ac6f5"
    evidence: source
  - value: {"result": "both are kept and can appear in selectors; no merge, no shadowing stated"}
    since: null
    until: null
    observed: "2026-11-04"
    source: codex-skills
    locator: "Duplicate names"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "When the model picks a skill by name and two skills share it, which one loads?"
    observed: "2026-11-04"
    source: codex-skills
sources:
  - id: codex-repo
    resource: "https://github.com/openai/codex"
    title: openai/codex source
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/corpora/alpha/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
  - id: codex-skills
    resource: "https://learn.chatgpt.com/docs/build-skills"
    title: "Codex docs: build skills (redirect target of developers.openai.com/codex/skills)"
---

What the sources say about [Duplicate skill names](/subjects/skills/duplicate-names.md) in
[Codex CLI](/harnesses/codex.md). What happens when two skills share a name, within one scope or across scopes (project, user, plugin, `.agents/`, `.claude/`): one shadows the other, both are shown, or an error.

## Observations

- 2026-10-01: mention: a `$name` mention needs exactly one enabled match, else it is skipped
  silently; other lookup: first enabled match.[^codex-repo][^skill-naming]
- 2026-11-04: result: both are kept and can appear in selectors; no merge, no shadowing stated. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^codex-skills]

  > If two skills share the same name, Codex doesn't merge them; both can appear in skill selectors.

## Open questions

- When the model picks a skill by name and two skills share it, which one loads?[^codex-skills]

[^codex-repo]: openai/codex source
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)
[^codex-skills]: Codex docs: build skills (redirect target of developers.openai.com/codex/skills)
