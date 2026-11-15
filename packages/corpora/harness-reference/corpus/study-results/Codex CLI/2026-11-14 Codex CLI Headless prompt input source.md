---
kind: source
reportedIn:
  - "[openai codex exec src lib.rs at ce21072](../../documents/github.com/openai%20codex%20exec%20src%20lib.rs%20at%20ce21072.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
version: 0.167.2
version_basis: exact
observed: 2026-11-14
locator: codex-rs/exec/src/lib.rs#L1002-L1007 at ce21072c90d32c40af7a55b60b2fb35c84a43a6a
excerpt:
  exact: "items.push(UserInput::Text { text: prompt_text.clone(), // CLI input doesn't track UI element ranges, so none are available here. text_elements: Vec::new(), }); let output_schema = load_output_schema(output_schema_path);"
  prefix: "th, detail: None }) .collect(); "
  suffix: " ( InitialOperation::UserTurn { "
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> items.push(UserInput::Text { text: prompt_text.clone(), // CLI input doesn't track UI element ranges, so none are available here. text_elements: Vec::new(), }); let output_schema = load_output_schema(output_schema_path);
