---
type: Harness Probe
title: Gemini CLI sign-in
description: "Run one prompt with Gemini CLI signed in to a personal Google account, and record whether it is served."
tags: [meta]
subjects: [meta/lifecycle]
harnesses: [gemini-cli]
commands:
  gemini-cli:
    - "gemini --version"
    - 'gemini -p "Reply with ok."'
record:
  - The harness version.
  - The reply, or the error name and message.
  - "The sign-in kind: personal Google account, Workspace, or an API key."
safety:
  - "Uses the signed-in Google account. A first run may start a browser sign-in."
---

# Gemini CLI sign-in

Checks whether Gemini CLI still serves the sign-in kind used. It needs no fixture.
