---
type: Harness Fact
title: "Agent Skills (agentskills.io): Plugin manifest fields"
description: "Plugin manifest fields in Agent Skills (agentskills.io), as observed over time."
tags: [plugins]
harness: agent-skills
subject: plugins/manifest-fields
observations:
  - value:
      applicable: false
    since: null
    until: null
    observed: "2026-11-05"
    source: agent-skills-spec
    locator: "docs/specification.mdx:6-17 at 83021e2be457a9b6679148719c1f6074f0ad975e"
    evidence: inferred
    note: "The standard defines one skill directory with a SKILL.md file. It defines no plugin package or plugin manifest; SKILL.md frontmatter is a skill format, not a plugin manifest."
sources:
  - id: agent-skills-spec
    resource: "https://github.com/agentskills/agentskills/blob/83021e2be457a9b6679148719c1f6074f0ad975e/docs/specification.mdx"
    title: "Agent Skills specification"
---

What the sources say about [Plugin manifest fields](/subjects/plugins/manifest-fields.md) in
[Agent Skills (agentskills.io)](/harnesses/agent-skills.md).

## Observations

- 2026-11-05: applicable: `false`. The specification covers a single skill directory and never
  mentions a plugin or a manifest; this is inferred from that silence.[^agent-skills-spec]

  > A skill is a directory containing, at minimum, a `SKILL.md` file:

[^agent-skills-spec]: Agent Skills specification
