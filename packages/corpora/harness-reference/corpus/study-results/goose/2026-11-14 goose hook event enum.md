---
kind: source
reportedIn:
  - "[aaif-goose goose hooks mod.rs at 2365bc5](../../documents/github.com/aaif-goose%20goose%20hooks%20mod.rs%20at%202365bc5.md)"
harness: "[goose](../../harnesses/goose.md)"
version: 1.59.0
version_basis: exact
observed: 2026-11-14
locator: crates/goose/src/hooks/mod.rs#L55-L68 at 2365bc5e898a38133c373eef2d1357416acd66e2
excerpt:
  exact: pub enum HookEvent { PreToolUse, PreToolUseResult, PostToolUse, PostToolUseFailure, SessionStart, SessionEnd, UserPromptSubmit, BeforeReadFile, AfterFileEdit, BeforeShellExecution, AfterShellExecution, Stop, }
  prefix: "ne, Copy, PartialEq, Eq, Hash)] "
  suffix: " impl HookEvent { fn name(&self)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> pub enum HookEvent { PreToolUse, PreToolUseResult, PostToolUse, PostToolUseFailure, SessionStart, SessionEnd, UserPromptSubmit, BeforeReadFile, AfterFileEdit, BeforeShellExecution, AfterShellExecution, Stop, }
