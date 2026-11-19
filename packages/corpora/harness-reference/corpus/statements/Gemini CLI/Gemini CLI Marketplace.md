---
proposition:
  subject: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
  predicate: plugins/marketplace
  object:
    supported: false
    note: no marketplace catalog; extensions are released from a Git repository or GitHub Releases and installed by URL; the gallery at geminicli.com/extensions/browse indexes public GitHub repositories with the gemini-cli-extension topic
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI extension release channels docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extension%20release%20channels%20docs.md)"
      - "[2026-11-14 Gemini CLI extension gallery docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extension%20gallery%20docs.md)"
      - "[2026-11-14 Gemini CLI extension gallery topic docs](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extension%20gallery%20topic%20docs.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs at 0.68.0: release channels are Git and GitHub Releases; the gallery is an index for discovery."
  - hasEvidenceItems:
      - "[2026-11-14 Gemini CLI extension registry URL source](../../study-results/Gemini%20CLI/2026-11-14%20Gemini%20CLI%20extension%20registry%20URL%20source.md)"
    directionOfEvidenceProvided: neutral
    description: "source at 0.68.0: the CLI can read the gallery index from geminicli.com/extensions.json, for the `/extensions explore` view behind `experimental.extensionRegistry`."
reportedIn:
  - "[google-gemini gemini-cli docs extensions releasing.md at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20docs%20extensions%20releasing.md%20at%205a5c718.md)"
  - "[google-gemini gemini-cli cli src config extensionRegistryClient.ts at 5a5c718](../../documents/github.com/google-gemini%20gemini-cli%20cli%20src%20config%20extensionRegistryClient.ts%20at%205a5c718.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subject: "[Marketplace](../../subjects/plugins/Marketplace.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

Extensions are not installed from a marketplace catalog. An author publishes a repository; the gallery finds it by its GitHub topic, and a user installs it by URL. Whether the gallery counts as a marketplace is a judgment: it lists extensions but is not an install source.
