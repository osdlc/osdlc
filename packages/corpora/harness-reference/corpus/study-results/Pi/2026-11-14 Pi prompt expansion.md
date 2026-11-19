---
kind: source
reportedIn:
  - "[Pi source agent-session.ts at v1.5.2](../../documents/github.com/Pi%20source%20agent-session.ts%20at%20v1.5.2.md)"
harness: "[Pi](../../harnesses/Pi.md)"
version: 1.5.2
version_basis: exact
observed: 2026-11-14
locator: _preparePrompt, L2219-L2224
excerpt:
  exact: if (expandPromptTemplates) { expandedText = this._expandSkillCommand(expandedText); expandedText = expandPromptTemplate(expandedText, [...this.promptTemplates]); }
  prefix: "let expandedText = currentText; "
  suffix: " // If streaming, queue via stee"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> if (expandPromptTemplates) { expandedText = this._expandSkillCommand(expandedText); expandedText = expandPromptTemplate(expandedText, [...this.promptTemplates]); }
