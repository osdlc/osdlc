---
type: Harness Probe
title: Session environment
description: "Ask a live Claude Code session to print the environment variables it gives to the commands it runs."
tags: [cli]
subjects: [cli/session-env]
harnesses: [claude-code]
commands:
  claude-code:
    - "claude --version"
    - 'claude -p --allowedTools "Bash(env:*)" "Run env and list every variable whose name starts with CLAUDE, with its value."'
record:
  - The harness version.
  - "The names of the `CLAUDE*` variables. Record values only when they hold no account or machine detail."
safety:
  - Uses the signed-in account and counts against its usage.
  - "The output can include session ids and paths; record names, not values."
---

# Session environment

Runs one print-mode prompt that only lists environment variables. It is the scripted form of a
check first made by hand in an interactive session. It needs no fixture.
