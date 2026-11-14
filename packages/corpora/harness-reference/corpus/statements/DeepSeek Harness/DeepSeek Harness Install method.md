---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: cli/install
  object:
    supported: true
    methods:
      - kind: npm
        argv:
          - npx
          - "@deepseek-ai/dsh"
          - web
        package: "@deepseek-ai/dsh"
        note: "Runs the web profile from npm; needs Node.js."
      - kind: other
        argv:
          - pnpm
          - dsh
          - web
        note: "From a checkout, after git clone, pnpm install and pnpm run build."
      - kind: app
        package: DeepSeek Harness Desktop
        platforms:
          - macos
          - windows
        note: "Manage dsh Command… in the application menu installs the dsh command: /usr/local/bin/dsh on macOS, the user PATH on Windows."
    update: "Desktop command: the CLI runtime version follows the installed Desktop release."
    uninstall: "Desktop command: Manage dsh Command… → Remove, before uninstalling Desktop."
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 dsh README run from npm](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20README%20run%20from%20npm.md)"
      - "[2026-11-14 dsh README run from source](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20README%20run%20from%20source.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "The README gives the npx command and the steps to run from a checkout."
  - hasEvidenceItems:
      - "[2026-11-14 dsh Desktop manage dsh command](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20Desktop%20manage%20dsh%20command.md)"
      - "[2026-11-14 dsh Desktop command location](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20Desktop%20command%20location.md)"
      - "[2026-11-14 dsh Desktop command removal and version](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20Desktop%20command%20removal%20and%20version.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "The Desktop README describes installing, updating and removing the dsh command that Desktop provides."
reportedIn:
  - "[deepseek-ai deepseek-harness README.md at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20README.md%20at%2039163dd.md)"
  - "[deepseek-ai deepseek-harness desktop README at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20desktop%20README%20at%2039163dd.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Install method](../../subjects/cli/Install%20method.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The README names no update or uninstall step for the npm route, so `update` and `uninstall` cover the Desktop command only.
