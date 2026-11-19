---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: plugins/marketplace-git-ref
  object:
    supported: partial
    ref_syntax: --ref <ref>
    argv:
      - extensions
      - install
      - "{source}"
      - --ref
      - "{ref}"
    note: "`--ref` applies to an extension installed from a git repository; a marketplace source refuses it"
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Qwen Code Install ref option source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Install%20ref%20option%20source.md)"
      - "[2026-11-14 Qwen Code Install ref marketplace source](../../study-results/Qwen%20Code/2026-11-14%20Qwen%20Code%20Install%20ref%20marketplace%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at v0.27.3: the install command's --ref option and its check"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Marketplace git ref](../../subjects/plugins/Marketplace%20git%20ref.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

An extension can be installed from a git ref with `--ref`. A marketplace plugin cannot: the install command rejects `--ref` for a marketplace source. The source does not name which ref kinds are accepted, so `kinds` is left out.
