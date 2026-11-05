---
type: Harness Fact
title: "Agent Skills (agentskills.io): Files beside SKILL.md"
description: "Files beside SKILL.md in Agent Skills (agentskills.io), as observed over time."
tags: [skills]
harness: agent-skills
subject: skills/bundled-files
observations:
  - value: {"supported": false, "detail": "resources load only when required"}
    since: null
    until: null
    observed: "2026-11-04"
    source: agentskills-specification
    locator: "Progressive disclosure"
    evidence: docs
  - value: {"supported": false, "detail": "activation tool may list bundled files but should not read them eagerly"}
    since: null
    until: null
    observed: "2026-11-04"
    source: agentskills-client-guide
    locator: "Listing bundled resources"
    evidence: docs
    note: "Implementer guide, not the normative spec."
sources:
  - id: agentskills-specification
    resource: "https://agentskills.io/specification"
    title: "Agent Skills specification"
  - id: agentskills-client-guide
    resource: "https://agentskills.io/client-implementation/adding-skills-support"
    title: "Agent Skills: how to add skills support to your agent"
---

What the sources say about [Files beside SKILL.md](/subjects/skills/bundled-files.md) in [Agent Skills (agentskills.io)](/harnesses/agent-skills.md).
Whether files beside SKILL.md (scripts, references, assets) load into context without being asked for.

## Observations

- 2026-11-04: supported: no; detail: resources load only when required.[^agentskills-specification]

  > Resources (as needed): Files (e.g. those in scripts/, references/, or assets/) are loaded only when required
- 2026-11-04: supported: no; detail: activation tool may list bundled files but should not read them eagerly. Implementer guide, not the normative spec.[^agentskills-client-guide]

  > it can also enumerate supporting files (scripts, references, assets) in the skill directory — but it should not eagerly read them.

[^agentskills-specification]: Agent Skills specification
[^agentskills-client-guide]: Agent Skills: how to add skills support to your agent
