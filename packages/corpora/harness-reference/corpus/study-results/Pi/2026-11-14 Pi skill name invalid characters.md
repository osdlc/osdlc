---
kind: source
reportedIn:
  - "[Pi source skills.ts at v1.5.2](../../documents/github.com/Pi%20source%20skills.ts%20at%20v1.5.2.md)"
harness: "[Pi](../../harnesses/Pi.md)"
version: 1.5.2
version_basis: exact
observed: 2026-11-14
locator: validateName, L99-L101
excerpt:
  exact: if (!/^[a-z0-9-]+$/.test(name)) { errors.push(`name contains invalid characters (must be lowercase a-z, 0-9, hyphens only)`); }
  prefix: "haracters (${name.length})`); } "
  suffix: ' if (name.startsWith("-") || nam'
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> if (!/^[a-z0-9-]+$/.test(name)) { errors.push(`name contains invalid characters (must be lowercase a-z, 0-9, hyphens only)`); }
