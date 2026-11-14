---
proposition:
  subject: "[Kiro](../../harnesses/Kiro.md)"
  predicate: cli/install
  object:
    supported: true
    methods:
      - kind: brew
        argv:
          - brew
          - install
          - kiro-cli
        platforms:
          - macos
      - kind: script
        argv:
          - sh
          - -c
          - curl -fsSL https://cli.kiro.dev/install | bash
        platforms:
          - macos
          - linux
      - kind: script
        argv:
          - powershell
          - -Command
          - irm 'https://cli.kiro.dev/install.ps1' | iex
        platforms:
          - windows
      - kind: other
        argv:
          - sudo
          - dnf
          - install
          - kiro-cli
        platforms:
          - linux
        note: Amazon Linux 2023, after adding the RPM repository file
      - kind: other
        argv:
          - sudo
          - dpkg
          - -i
          - kiro-cli.deb
        package: kiro-cli.deb
        platforms:
          - linux
        note: Ubuntu, x86-64 only
      - kind: binary
        package: kirocli.zip
        platforms:
          - linux
        note: unzip the archive and run its install.sh; x86-64 and aarch64, glibc and musl builds
    update: auto-updates in the background and installs on exit; `kiro-cli update` updates by hand; package-manager installs update through the package manager
    uninstall: "`kiro-cli uninstall` (install script or archive; removes ~/.local/bin/kiro-cli and keeps ~/.kiro); `brew uninstall --cask kiro-cli` for Homebrew"
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 kiro install with homebrew](../../study-results/Kiro/2026-11-14%20kiro%20install%20with%20homebrew.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: Homebrew."
  - hasEvidenceItems:
      - "[2026-11-14 kiro install script](../../study-results/Kiro/2026-11-14%20kiro%20install%20script.md)"
      - "[2026-11-14 kiro install on windows](../../study-results/Kiro/2026-11-14%20kiro%20install%20on%20windows.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the install scripts."
  - hasEvidenceItems:
      - "[2026-11-14 kiro install with dnf](../../study-results/Kiro/2026-11-14%20kiro%20install%20with%20dnf.md)"
      - "[2026-11-14 kiro install deb package](../../study-results/Kiro/2026-11-14%20kiro%20install%20deb%20package.md)"
      - "[2026-11-14 kiro install from zip](../../study-results/Kiro/2026-11-14%20kiro%20install%20from%20zip.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: the Linux packages."
  - hasEvidenceItems:
      - "[2026-11-14 kiro cli auto-update](../../study-results/Kiro/2026-11-14%20kiro%20cli%20auto-update.md)"
      - "[2026-11-14 kiro cli update command](../../study-results/Kiro/2026-11-14%20kiro%20cli%20update%20command.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: updating."
  - hasEvidenceItems:
      - "[2026-11-14 kiro cli uninstall](../../study-results/Kiro/2026-11-14%20kiro%20cli%20uninstall.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: "docs observed 2026-11-14: uninstalling."
reportedIn:
  - "[Kiro docs Installation](../../documents/kiro.dev/Kiro%20docs%20Installation.md)"
  - "[Kiro docs CLI commands](../../documents/kiro.dev/Kiro%20docs%20CLI%20commands.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[Kiro](../../harnesses/Kiro.md)"
subject: "[Install method](../../subjects/cli/Install%20method.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
