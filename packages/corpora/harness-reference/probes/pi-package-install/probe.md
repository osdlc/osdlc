---
type: Harness Probe
title: pi package install
description: "Install a local folder as a pi package, with and without a package.json, and check that pi lists it."
tags: [plugins]
subjects: [plugins/install]
harnesses: [pi]
commands:
  pi:
    - "pi --version"
    - "pi install ./fixture/with-manifest"
    - "pi install ./fixture/without-manifest"
    - "pi list"
record:
  - The harness version.
  - Whether each package appears in `pi list`, and under what name.
  - Which settings file the install was recorded in.
  - The `packages` entry each install wrote, as written, and whether it is relative.
safety:
  - "`pi install` without `-l` records the package in the user's agent settings, which every pi session reads. Run it against a throwaway agent folder, or remove the packages afterwards."
---

# pi package install

`fixture/with-manifest/` has a `package.json` with a `pi.skills` entry. `fixture/without-manifest/`
has only the conventional `skills/` folder. Each holds one skill, `probe`. A run checks install and
listing only; it does not ask the model to load the skill.
