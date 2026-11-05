---
type: Harness Fact
title: "Claude Code: Duplicate skill names"
description: "Duplicate skill names in Claude Code, as observed over time."
tags: [skills]
harness: claude-code
subject: skills/duplicate-names
observations:
  - value: { across_plugins: "distinct (`a:review`, `b:review`)", same_plugin_two_marketplaces: "identical prefix, no documented tiebreak" }
    since: null
    until: null
    observed: "2026-10-01"
    source: claude-marketplace-reference
    via: skill-naming
    evidence: docs
  - value: {"enterprise_personal_project": "one shadows the other: enterprise over personal, personal over project", "plugin_vs_other_locations": "both load; plugin skill is namespaced /plugin-name:skill-name", "user_vs_bundled": "user skill replaces the bundled command, not its aliases"}
    since: null
    until: null
    observed: "2026-11-04"
    source: claude-code-skills
    locator: "Resolve skills that share a name (table)"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "What happens when two skills with the same name exist at the same scope, for example two nested .claude/skills directories in a monorepo?"
    observed: "2026-11-04"
    source: claude-code-skills
sources:
  - id: claude-marketplace-reference
    resource: "https://code.claude.com/docs/en/plugins/marketplace-reference"
    title: "Claude Code docs: marketplace reference"
  - id: skill-naming
    resource: "https://github.com/osdlc/skillwright/blob/main/harness-reference/sources/skill-naming-across-harnesses.md"
    title: "What is a plugin skill called in each harness (researched 2026-10-01)"
  - id: claude-code-skills
    resource: "https://code.claude.com/docs/en/skills"
    title: "Claude Code docs: skills"
---

What the sources say about [Duplicate skill names](/subjects/skills/duplicate-names.md) in
[Claude Code](/harnesses/claude-code.md). What happens when two skills share a name, within one scope or across scopes (project, user, plugin, `.agents/`, `.claude/`): one shadows the other, both are shown, or an error.

## Observations

- 2026-10-01: across plugins: distinct (`a:review`, `b:review`); same plugin two marketplaces:
  identical prefix, no documented tiebreak.[^claude-marketplace-reference][^skill-naming]
- 2026-11-04: enterprise personal project: one shadows the other: enterprise over personal, personal over project; plugin vs other locations: both load; plugin skill is namespaced /plugin-name:skill-name; user vs bundled: user skill replaces the bundled command, not its aliases. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^claude-code-skills]

  > Two of enterprise, personal, and project | Enterprise over personal, and personal over project. With deploy in both ~/.claude/skills/ and the project's .claude/skills/, /deploy runs the personal one

  > A plugin skill and a skill at any of the locations above | Both load, because plugin skills are namespaced as /plugin-name:skill-name

  > Your skill replaces the bundled command, but not its aliases.

## Open questions

- What happens when two skills with the same name exist at the same scope, for example two nested .claude/skills directories in a monorepo?[^claude-code-skills]

[^claude-marketplace-reference]: Claude Code docs: marketplace reference
[^skill-naming]: What is a plugin skill called in each harness (researched 2026-10-01)
[^claude-code-skills]: Claude Code docs: skills
