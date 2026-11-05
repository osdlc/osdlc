---
type: Harness Fact
title: "Amp: Duplicate skill names"
description: "Duplicate skill names in Amp, as observed over time."
tags: [skills]
harness: amp
subject: skills/duplicate-names
observations:
  - value: {"winner": "first in precedence order", "order": ["~/.config/agents/skills", "~/.agents/skills", "~/.config/amp/skills", ".agents/skills (project and searched parents)", ".claude/skills (those directories)", "~/.claude/skills", "~/.claude/plugins/cache", "amp.skills.path directories", "personal skills repository", "workspace skills repository", "official Amp skills"]}
    since: null
    until: null
    observed: "2026-11-04"
    source: amp-skills
    locator: "Skill Sources and Precedence"
    evidence: docs
  - value: {"plugin_skills": "qualified as <plugin-name>:<skill-name>, so they do not compete with bare names"}
    since: null
    until: null
    observed: "2026-11-04"
    source: amp-skills
    locator: "Skill Sources and Precedence"
    evidence: docs
sources:
  - id: amp-skills
    resource: "https://ampcode.com/docs/markdown/customize/skills"
    title: "Amp docs: Skills"
---

What the sources say about [Duplicate skill names](/subjects/skills/duplicate-names.md) in [Amp](/harnesses/amp.md).
What happens when two skills share a name, within one scope or across scopes (project, user, plugin, `.agents/`, `.claude/`): one shadows the other, both are shown, or an error.

## Observations

- 2026-11-04: winner: first in precedence order; order: ~/.config/agents/skills, ~/.agents/skills, ~/.config/amp/skills, .agents/skills (project and searched parents), .claude/skills (those directories), ~/.claude/skills, ~/.claude/plugins/cache, amp.skills.path directories, personal skills repository, workspace skills repository, official Amp skills.[^amp-skills]

  > Amp uses the first skill with a given frontmatter `name`.
- 2026-11-04: plugin skills: qualified as <plugin-name>:<skill-name>, so they do not compete with bare names.[^amp-skills]

  > Amp gives it the qualified name `<plugin-name>:<skill-name>`, so it does not compete with the bare skill names above.

[^amp-skills]: Amp docs: Skills
