---
kind: docs
reportedIn:
  - "[Gemini CLI docs Agent Skills](../../documents/geminicli.com/Gemini%20CLI%20docs%20Agent%20Skills.md)"
harness: "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
observed: 2026-11-04
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-04T00:00:00Z
imported_from: fact:skills/duplicate-names@gemini-cli#observation-1
---

Imported from `facts/gemini-cli/skills/duplicate-names.md`, observation 1.

- behavior: "higher-precedence location shadows lower"
- order_low_to_high: ["built-in","extension","user","workspace"]
- within_scope: ".agents/skills alias takes precedence over .gemini/skills"

Read through a fetch tool that summarises, so the quoted wording may be paraphrased.
