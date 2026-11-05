---
type: Harness Fact
title: "Copilot CLI: How the agent loads a skill"
description: "How the agent loads a skill in Copilot CLI, as observed over time."
tags: [skills]
harness: copilot-cli
subject: skills/agent-loading
observations:
  - value: {"loaded_when_relevant": "when relevant to the task, not in every conversation"}
    since: null
    until: null
    observed: "2026-11-04"
    source: copilot-cli-about-agent-skills
    locator: "About agent skills"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"body_at_startup": false, "body_on": "when invoked via /SKILL-NAME or automatically by the agent; content is injected into the conversation"}
    since: null
    until: null
    observed: "2026-11-04"
    source: copilot-cli-command-reference
    locator: "Skills reference"
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
  - value: {"decision": "Copilot decides from the prompt and the skill description"}
    since: null
    until: null
    observed: "2026-11-04"
    source: copilot-cli-add-skills
    evidence: docs
    note: "Read through a fetch tool that summarises, so the quoted wording may be paraphrased."
open:
  - question: "Does the model load a skill through a named tool or a file read?"
    observed: "2026-11-04"
    source: copilot-cli-add-skills
sources:
  - id: copilot-cli-about-agent-skills
    resource: "https://docs.github.com/en/copilot/concepts/agents/about-agent-skills"
    title: "Copilot docs: about agent skills"
  - id: copilot-cli-command-reference
    resource: "https://docs.github.com/en/copilot/reference/cli-command-reference"
    title: "Copilot docs: CLI command reference"
  - id: copilot-cli-add-skills
    resource: "https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills"
    title: "Copilot docs: add skills to Copilot CLI"
---

What the sources say about [How the agent loads a skill](/subjects/skills/agent-loading.md) in [Copilot CLI](/harnesses/copilot-cli.md).
How the model loads a skill body, and when: at startup, when the task matches, or only on invocation.

## Observations

- 2026-11-04: loaded when relevant: when relevant to the task, not in every conversation. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^copilot-cli-about-agent-skills]

  > rather than including the whole workflow in every conversation.
- 2026-11-04: body at startup: no; body on: when invoked via /SKILL-NAME or automatically by the agent; content is injected into the conversation. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^copilot-cli-command-reference]

  > When invoked (via /SKILL-NAME or automatically by the agent), the skill's content is injected into the conversation.
- 2026-11-04: decision: Copilot decides from the prompt and the skill description. Read through a fetch tool that summarises, so the quoted wording may be paraphrased.[^copilot-cli-add-skills]

  > Copilot will decide when to use your skills based on your prompt and the skill's description.

## Open questions

- Does the model load a skill through a named tool or a file read?[^copilot-cli-add-skills]

[^copilot-cli-about-agent-skills]: Copilot docs: about agent skills
[^copilot-cli-command-reference]: Copilot docs: CLI command reference
[^copilot-cli-add-skills]: Copilot docs: add skills to Copilot CLI
