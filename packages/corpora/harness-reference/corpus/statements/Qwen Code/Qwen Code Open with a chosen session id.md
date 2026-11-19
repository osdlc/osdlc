---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: cli/open-with-id
  object:
    supported: true
    flags: --session-id <uuid>
    note: the id must be a valid UUID; the flag cannot be combined with --continue or --resume
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-09 Qwen Code Session id option source](../../study-results/Qwen%20Code/2026-11-09%20Qwen%20Code%20Session%20id%20option%20source.md)"
      - "[2026-11-14 Qwen Code Session id UUID check source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Session%20id%20UUID%20check%20source.md)"
      - "[2026-11-14 Qwen Code Session id must be UUID source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Session%20id%20must%20be%20UUID%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source: the option at v0.27.0, and its checks at v0.27.3"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Open with a chosen session id](../../subjects/cli/Open%20with%20a%20chosen%20session%20id.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

`--session-id` starts a new session under the given id. The id must be a UUID. No source shows a flag that names a session.
