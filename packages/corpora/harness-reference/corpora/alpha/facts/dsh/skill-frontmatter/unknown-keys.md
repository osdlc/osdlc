---
type: Harness Fact
title: "DeepSeek Harness (dsh): Unknown frontmatter keys"
description: "Unknown frontmatter keys in DeepSeek Harness (dsh), as observed over time."
tags: [skill-frontmatter]
harness: dsh
subject: skill-frontmatter/unknown-keys
observations:
  - value: {"known_keys": ["name", "description", "whenToUse", "metadata", "disable-model-invocation", "user-invocable"], "invalid_invocation_value": "whole skill dropped with a warning", "invalid_name_or_no_frontmatter": "skipped with a warning"}
    since: null
    until: null
    observed: "2026-11-04"
    source: dsh-skill-filesystem
    locator: "packages/skill/skill-filesystem/README.md:38 at fcc0ad46"
    evidence: source
open:
  - question: "What happens with a frontmatter key outside the known list?"
    observed: "2026-11-04"
    source: dsh-skill-filesystem
sources:
  - id: dsh-skill-filesystem
    resource: "https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/skill/skill-filesystem/README.md"
    title: "dsh skill-filesystem package README"
---

What the sources say about [Unknown frontmatter keys](/subjects/skill-frontmatter/unknown-keys.md) in [DeepSeek Harness (dsh)](/harnesses/dsh.md).
What the harness does with a frontmatter key it does not know: ignore it, warn, or reject the skill.

## Observations

- 2026-11-04: known keys: name, description, whenToUse, metadata, disable-model-invocation, user-invocable; invalid invocation value: whole skill dropped with a warning; invalid name or no frontmatter: skipped with a warning.[^dsh-skill-filesystem]

  > a rejected spelling or a non-boolean value drops the whole skill with a warning rather than silently permitting a surface.

## Open questions

- What happens with a frontmatter key outside the known list?[^dsh-skill-filesystem]

[^dsh-skill-filesystem]: dsh skill-filesystem package README
