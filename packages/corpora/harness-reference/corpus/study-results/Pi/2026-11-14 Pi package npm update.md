---
kind: source
reportedIn:
  - "[Pi source package-manager.ts at v1.5.2](../../documents/github.com/Pi%20source%20package-manager.ts%20at%20v1.5.2.md)"
harness: "[Pi](../../harnesses/Pi.md)"
version: 1.5.2
version_basis: exact
observed: 2026-11-14
locator: updateNpmBatch and getNpmInstallArgs, L1327-L1329, L2041
excerpt:
  exact: return ["install", ...specs, "--prefix", installRoot, "--legacy-peer-deps", "--no-audit", "--no-fund"];
  prefix: "pi peers, so skip audit advice. "
  suffix: " } private async installNpm(sour"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> return ["install", ...specs, "--prefix", installRoot, "--legacy-peer-deps", "--no-audit", "--no-fund"];
