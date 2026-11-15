---
specifiedBy: "[Config path probe](../../../methods/Config%20path%20probe.md)"
contributions:
  - contributor: { name: Sam Example, agentType: person }
    activityType: created
    date: 2026-11-02T14:05:00Z
  - contributor: { name: probe-runner 0.4, agentType: software }
    activityType: verified
    date: 2026-11-03T08:00:00Z
ancillaryResults:
  configRead: ~/.config/fernlog/config.toml
qualityMeasures:
  environment:
    os: Ubuntu 24.04
    shell: dash 0.5.12
  fernlogVersion: 2.3.1
  places: 2
  runsPerPlace: 3
---

fernlog read `~/.config/fernlog/config.toml` on all three runs at that place. It ignored
`~/.fernlog.toml` on all three runs there.

- The script that ran: [probe.sh](probe.sh).
- Its output, one row per run: [results.csv](results.csv).
