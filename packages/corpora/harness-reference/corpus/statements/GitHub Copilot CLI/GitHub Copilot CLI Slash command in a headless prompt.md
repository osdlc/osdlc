---
proposition:
  subject: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
  predicate: cli/headless-slash-command
  object:
    supported: true
    position: prompt start in the documented example, `copilot -p '/review ...'`
    arguments: the text after the command name, in the documented example
    note: the skills page says a skill is named in a prompt as `/skill-name`, and its example has the call mid-sentence
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Review slash command in prompt docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Review%20slash%20command%20in%20prompt%20docs.md)"
      - "[2026-11-14 GitHub Copilot CLI Review slash command in prompt example docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Review%20slash%20command%20in%20prompt%20example%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The programmatic how-to runs a slash command through -p.
  - hasEvidenceItems:
      - "[2026-11-14 GitHub Copilot CLI Skill named in a prompt docs](../../study-results/GitHub%20Copilot%20CLI/2026-11-14%20GitHub%20Copilot%20CLI%20Skill%20named%20in%20a%20prompt%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The skills page describes naming a skill in a prompt.
reportedIn:
  - "[Copilot docs running Copilot CLI programmatically](../../documents/docs.github.com/Copilot%20docs%20running%20Copilot%20CLI%20programmatically.md)"
  - "[Copilot docs add skills to Copilot CLI](../../documents/docs.github.com/Copilot%20docs%20add%20skills%20to%20Copilot%20CLI.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[GitHub Copilot CLI](../../harnesses/GitHub%20Copilot%20CLI.md)"
subject: "[Slash command in a headless prompt](../../subjects/cli/Slash%20command%20in%20a%20headless%20prompt.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - Is a slash command that is not at the start of a -p prompt parsed by the CLI, or left to the model?
---

The docs show one headless call: `/review` at the start of a `-p` prompt, followed by free text. They do not state a parsing rule, so what happens to a call elsewhere in a headless prompt is open.
