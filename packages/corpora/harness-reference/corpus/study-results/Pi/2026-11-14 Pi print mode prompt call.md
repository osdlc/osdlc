---
kind: source
reportedIn:
  - "[Pi source print-mode.ts at v1.5.2](../../documents/github.com/Pi%20source%20print-mode.ts%20at%20v1.5.2.md)"
harness: "[Pi](../../harnesses/Pi.md)"
version: 1.5.2
version_basis: exact
observed: 2026-11-14
locator: runPrintMode, L138-L140
excerpt:
  exact: "await session.prompt(initialMessage, { images: initialImages });"
  prefix: "ession(); if (initialMessage) { "
  suffix: " } for (const message of message"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> await session.prompt(initialMessage, { images: initialImages });
