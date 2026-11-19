---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: plugins/marketplace-git-ref
  object:
    supported: true
    ref_syntax: --ref <ref>
    kinds:
      - branch
      - tag
      - commit
    argv:
      - extensions
      - install
      - <source>
      - --ref
      - <ref>
    note: there is no marketplace; the ref applies to an extension installed from a git source
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI extension install ref option source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extension%20install%20ref%20option%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: "source at 0.68.0: the --ref option of gemini extensions install."
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI extension install ref docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extension%20install%20ref%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs at 0.68.0: the ref is a branch, tag or commit."
reportedIn:
  - "[google-gemini gemini-cli cli src commands extensions install.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20commands%20extensions%20install.ts%20at%205a5c718.md)"
  - "[google-gemini gemini-cli docs extensions reference.md at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20docs%20extensions%20reference.md%20at%205a5c718.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Marketplace git ref](../../subjects/plugins/Marketplace%20git%20ref.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

`gemini extensions install <source> --ref <ref>` installs an extension at a git ref. The ref kinds come from the docs.
