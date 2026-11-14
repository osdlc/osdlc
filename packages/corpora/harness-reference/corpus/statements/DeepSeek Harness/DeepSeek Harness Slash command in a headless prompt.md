---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: cli/headless-slash-command
  object:
    supported: true
    position: "anywhere in the task text, as a whitespace-bounded /name token that names a user-invocable skill"
    arguments: "none; the token only injects the skill instructions"
    later_text: stays in the prompt as ordinary text
    not_at_start: "still parsed; a token that names no user-invocable skill stays ordinary prose"
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 dsh skill gesture pattern](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20skill%20gesture%20pattern.md)"
      - "[2026-11-14 dsh skill gesture user messages only](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20skill%20gesture%20user%20messages%20only.md)"
      - "[2026-11-14 dsh headless task is a user message](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20headless%20task%20is%20a%20user%20message.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "tool-skill scans user-sourced messages for /name tokens, and headless submits the task as a user-sourced message."
  - hasEvidenceItems:
      - "[2026-11-14 dsh base bundle mounts the skill plugins](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20base%20bundle%20mounts%20the%20skill%20plugins.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "The base bundle, which the headless profile is built on, mounts skill-filesystem and tool-skill."
  - hasEvidenceItems:
      - "[2026-11-14 dsh slash token anywhere in a user message](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20slash%20token%20anywhere%20in%20a%20user%20message.md)"
      - "[2026-11-14 dsh unknown slash names stay prose](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20unknown%20slash%20names%20stay%20prose.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "The tool-skill README describes the same gesture."
reportedIn:
  - "[deepseek-ai deepseek-harness tool-skill index.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20tool-skill%20index.ts%20at%2039163dd.md)"
  - "[deepseek-ai deepseek-harness headless index.ts at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20headless%20index.ts%20at%2039163dd.md)"
  - "[deepseek-ai deepseek-harness base bundle cordis.patch.yml at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20base%20bundle%20cordis.patch.yml%20at%2039163dd.md)"
  - "[deepseek-ai deepseek-harness tool-skill README at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20tool-skill%20README%20at%2039163dd.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Slash command in a headless prompt](../../subjects/cli/Slash%20command%20in%20a%20headless%20prompt.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Read from source; not run. The harness, not the model, parses the token, so no model is named in the scope.
