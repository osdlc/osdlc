---
specifiedBy: "[Config path probe](../../methods/Config%20path%20probe.md)"
contributions:
  - contributor: { name: Sam Example, agentType: person }
    activityType: created
    date: 2026-11-02T15:10:00Z
ancillaryResults:
  configRead: ~/Library/Application Support/fernlog/config.toml
qualityMeasures:
  environment:
    os: macOS 15.4
    shell: zsh 5.9
  fernlogVersion: 2.3.1
  places: 3
  runsPerPlace: 3
---

fernlog read `~/Library/Application Support/fernlog/config.toml` on all three runs at that place.
With only `~/.config/fernlog/config.toml` in place, it printed no marker on any of three runs: it
did not read that file. It ignored `~/.fernlog.toml` too.

This run was done by hand and kept no files, so it is a plain record rather than a record folder.
