---
kind: run
specifiedBy: "[pi package install](../../methods/pi%20package%20install/pi%20package%20install.md)"
reportedIn:
  - "[Pi README](../../documents/Earendil%20Inc/Pi%20README.md)"
  - "[What is a plugin skill called in each harness](../../documents/skillwright/What%20is%20a%20plugin%20skill%20called%20in%20each%20harness.md)"
harness: "[Pi](../../harnesses/Pi.md)"
version: 0.99.1
version_basis: exact
observed: 2026-10-01
locator: packages/coding-agent/docs/packages.md:12-14 at 88ff80b986e34d4fbd1fa94a4df65c60ae964516
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-10-01T00:00:00Z
imported_from: fact:plugins/install@pi#observation-2
---

Imported from `facts/pi/plugins/install.md`, observation 2.

- commands: ["pi install ./dir","pi install git:github.com/o/r@ref","pi install npm:@scope/pkg"]
- recorded_in: "packages in ~/.pi/agent/settings.json, or .pi/settings.json with -l"

A local install was run and appeared in `pi list`; skill loading was not run.
