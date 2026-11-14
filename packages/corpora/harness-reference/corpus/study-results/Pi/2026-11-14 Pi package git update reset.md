---
kind: source
reportedIn:
  - "[Pi source package-manager.ts at v1.5.2](../../documents/github.com/Pi%20source%20package-manager.ts%20at%20v1.5.2.md)"
harness: "[Pi](../../harnesses/Pi.md)"
version: 1.5.2
version_basis: exact
observed: 2026-11-14
locator: ensureGitRef, L2204-L2206
excerpt:
  exact: 'await this.runCommand("git", ["reset", "--hard", commitRef], { cwd: targetDir }); await this.cleanAndInstallGitDependencies(targetDir, markerPath);'
  prefix: 'eSync(markerPath, "", "utf-8"); '
  suffix: " } private async refreshTemporar"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> await this.runCommand("git", ["reset", "--hard", commitRef], { cwd: targetDir }); await this.cleanAndInstallGitDependencies(targetDir, markerPath);
