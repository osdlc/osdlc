---
kind: source
reportedIn:
  - "[Pi source mcp config.ts at v1.5.2](../../documents/github.com/Pi%20source%20mcp%20config.ts%20at%20v1.5.2.md)"
harness: "[Pi](../../harnesses/Pi.md)"
version: 1.5.2
version_basis: exact
observed: 2026-11-14
locator: L124-L137
excerpt:
  exact: 'if (type === "sse") { return invalid(`server "${name}": legacy SSE transport is not supported; use the streamable HTTP URL`); }'
  prefix: "t { type, url, command } = raw; "
  suffix: " // The casts below hold because"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> if (type === "sse") { return invalid(`server "${name}": legacy SSE transport is not supported; use the streamable HTTP URL`); }
