---
id: D-08
type: decision
state: accepted
created: 2026-11-07
---

# D-08: The companions' wire names stay as they are

## Decision

The VS Code and JetBrains hosts keep the names their companions already speak:

- the VS Code extension is `sdlc-host`, its settings are `sdlcHost.*`, and its Windows pipe is
  `\\.\pipe\sdlc-vscode-<pid>`;
- the JetBrains plugin serves its API under `/api/sdlc/`.

## Why

These names are a protocol between the host and a companion built and shipped elsewhere. Renaming
them here alone would break every installed companion, and the two hosts are experimental until
the companions are published (D-05). When the companions are published under this package's
name, the wire names change with them, in step, as a new protocol version.
