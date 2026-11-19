---
kind: source
reportedIn:
  - "[Qwen Code source extension-store.ts at ddeba2f](../../documents/github.com/Qwen%20Code%20source%20extension-store.ts%20at%20ddeba2f.md)"
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
version: 0.27.3
version_basis: exact
observed: 2026-11-14
locator: "#L2741-L2751"
excerpt:
  exact: await this.removeTransactionBackup(journal, budget);
  prefix: "RetryBudget, ): Promise<void> { "
  suffix: " if (journal.stagingDirectory) {"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> await this.removeTransactionBackup(journal, budget);
