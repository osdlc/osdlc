---
type: Harness Probe
title: pi version
description: "Print the installed pi version."
tags: [meta]
subjects: [meta/version-seen]
harnesses: [pi]
commands:
  pi:
    - "pi --version"
record:
  - The version printed.
safety: []
---

# pi version

Prints the version of the `pi` on the path. It needs no fixture and no account.
