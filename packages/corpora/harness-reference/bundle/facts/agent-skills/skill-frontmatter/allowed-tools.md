---
type: Harness Fact
title: "Agent Skills (agentskills.io): allowed-tools"
description: "allowed-tools in Agent Skills (agentskills.io), as observed over time."
tags: [skill-frontmatter]
harness: agent-skills
subject: skill-frontmatter/allowed-tools
observations:
  - value: { supported: true, required: false, form: space-separated string of pre-approved tools, experimental: true }
    since: null
    until: null
    observed: "2026-10-29"
    source: agentskills-spec
    evidence: docs
    note: "The spec says support for this field may vary between agent implementations."
sources:
  - id: agentskills-spec
    resource: "https://agentskills.io/specification"
    title: Agent Skills specification
---

What the sources say about [allowed-tools](/subjects/skill-frontmatter/allowed-tools.md) in
[Agent Skills (agentskills.io)](/harnesses/agent-skills.md). The `allowed-tools` field that lists tools a skill pre-approves to run.

## Observations

- 2026-10-29: supported: `true`; required: `false`; form: space-separated string of pre-approved
  tools; experimental: `true`. The spec says support for this field may vary between agent
  implementations.[^agentskills-spec]

[^agentskills-spec]: Agent Skills specification
