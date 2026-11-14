---
proposition:
  subject: "[goose](../../harnesses/goose.md)"
  predicate: cli/binary
  object:
    supported: true
    name: goose
    version_argv:
      - --version
    path_hint: ~/.local/bin/goose
    subcommand: run
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 goose cli command name](../../study-results/goose/2026-11-14%20goose%20cli%20command%20name.md)"
      - "[2026-11-14 goose cli run command](../../study-results/goose/2026-11-14%20goose%20cli%20run%20command.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The clap definition names the command goose, with a version flag, and run is the non-interactive subcommand.
  - hasEvidenceItems:
      - "[2026-11-14 goose docs goose version](../../study-results/goose/2026-11-14%20goose%20docs%20goose%20version.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The update guide checks the version with goose --version.
  - hasEvidenceItems:
      - "[2026-11-14 goose install script bin dir](../../study-results/goose/2026-11-14%20goose%20install%20script%20bin%20dir.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The install script puts the binary in the .local/bin folder of the home directory unless GOOSE_BIN_DIR says otherwise.
reportedIn:
  - "[aaif-goose goose cli.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20cli.rs%20at%202365bc5.md)"
  - "[aaif-goose goose updating-goose.md at 2365bc5](../../documents/github.com/aaif-goose%20goose%20updating-goose.md%20at%202365bc5.md)"
  - "[aaif-goose goose download_cli.sh at 2365bc5](../../documents/github.com/aaif-goose%20goose%20download_cli.sh%20at%202365bc5.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[goose](../../harnesses/goose.md)"
subject: "[Executable name](../../subjects/cli/Executable%20name.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---

The executable is `goose`. `goose --version` prints the version, and `goose run` is the subcommand for non-interactive use. The install script installs to `~/.local/bin` by default.
