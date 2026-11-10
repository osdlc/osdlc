---
methodType: probe
harnesses:
  - "[Pi](../../harnesses/Pi.md)"
subjects:
  - "[Plugin install](../../subjects/plugins/Plugin%20install.md)"
commands:
  pi:
    - pi --version
    - pi install ./fixture/with-manifest
    - pi install ./fixture/without-manifest
    - pi list
record:
  - The harness version.
  - Whether each package appears in `pi list`, and under what name.
  - Which settings file the install was recorded in.
  - The `packages` entry each install wrote, as written, and whether it is relative.
safety:
  - "`pi install` without `-l` records the package in the user's agent settings, which every pi session reads. Run it against a throwaway agent folder, or remove the packages afterwards."
imported_from: probe:pi-package-install
---

# pi package install

`fixture/with-manifest/` has a `package.json` with a `pi.skills` entry. `fixture/without-manifest/`
has only the conventional `skills/` folder. Each holds one skill, `probe`. A run checks install and
listing only; it does not ask the model to load the skill.

Imported from `probes/pi-package-install/probe.md`. The fixture files are in [fixture](fixture).
