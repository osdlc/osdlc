---
kind: source
reportedIn:
  - "[Pi source package-manager.ts at v1.5.2](../../documents/github.com/Pi%20source%20package-manager.ts%20at%20v1.5.2.md)"
harness: "[Pi](../../harnesses/Pi.md)"
version: 1.5.2
version_basis: exact
observed: 2026-11-14
locator: cleanAndInstallGitDependencies, L2153-L2160
excerpt:
  exact: 'await this.runCommand("git", ["clean", "-fdx"], { cwd: targetDir });'
  prefix: "lean. let cleaned = true; try { "
  suffix: " } catch (error) { cleaned = fal"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> await this.runCommand("git", ["clean", "-fdx"], { cwd: targetDir });
