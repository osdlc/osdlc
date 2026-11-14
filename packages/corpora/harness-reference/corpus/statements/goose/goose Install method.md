---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: cli/install
  object:
    supported: true
    methods:
      - kind: script
        platforms:
          - macos
          - linux
        note: curl -fsSL https://github.com/aaif-goose/goose/releases/download/stable/download_cli.sh | bash
      - kind: brew
        argv:
          - brew
          - install
          - block-goose-cli
        package: block-goose-cli
        platforms:
          - macos
        note: Listed under the macOS CLI tab.
      - kind: script
        platforms:
          - windows
        note: "PowerShell: download https://raw.githubusercontent.com/aaif-goose/goose/main/download_cli.ps1 and run .\\download_cli.ps1"
    update: goose update
    note: CONFIGURE=false before bash skips the interactive configuration. The script installs to ~/.local/bin unless GOOSE_BIN_DIR is set.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose docs install script macos](../../study-results/goose/2026-11-14%20goose%20docs%20install%20script%20macos.md)"
      - "[2026-11-14 goose docs install script linux](../../study-results/goose/2026-11-14%20goose%20docs%20install%20script%20linux.md)"
      - "[2026-11-14 goose docs install brew](../../study-results/goose/2026-11-14%20goose%20docs%20install%20brew.md)"
      - "[2026-11-14 goose docs install powershell](../../study-results/goose/2026-11-14%20goose%20docs%20install%20powershell.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The installation guide lists the download script, the Homebrew formula and the PowerShell script.
  - hasEvidenceItems:
      - "[2026-11-14 goose docs goose update](../../study-results/goose/2026-11-14%20goose%20docs%20goose%20update.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The update guide updates the CLI with goose update.
  - hasEvidenceItems:
      - "[2026-11-14 goose install script bin dir](../../study-results/goose/2026-11-14%20goose%20install%20script%20bin%20dir.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The install script names its default install directory.
reportedIn:
  - "[aaif-goose goose installation.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20installation.md%20at%202365bc5.md)"
  - "[aaif-goose goose updating-goose.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20updating-goose.md%20at%202365bc5.md)"
  - "[aaif-goose goose download_cli.sh at 2365bc5](../../documents/github.com/aaif-goose%20goose%20download_cli.sh%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Install method](../../subjects/cli/Install%20method.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - How is the CLI removed? The installation guide gives an uninstall step only for the Windows desktop app.
---

The docs install the CLI with a download script (macOS, Linux), Homebrew (`block-goose-cli`) or a PowerShell script (Windows). `goose update` updates it.
