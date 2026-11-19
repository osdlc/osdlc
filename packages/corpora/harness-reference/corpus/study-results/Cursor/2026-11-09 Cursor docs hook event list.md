---
kind: docs
reportedIn:
  - "[Cursor docs Hooks](../../documents/Anysphere/Cursor%20docs%20Hooks.md)"
harness: "[Cursor](../../harnesses/Cursor.md)"
observed: 2026-11-09
locator: Hook categories
excerpt:
  exact: "sessionStart / sessionEnd - Session lifecycle management preToolUse / postToolUse / postToolUseFailure - Generic tool use hooks (fires for all tools) subagentStart / subagentStop - Subagent (Task tool) lifecycle beforeShellExecution / afterShellExecution - Control shell commands beforeMCPExecution / afterMCPExecution - Control MCP tool usage beforeReadFile / afterFileEdit - Control file access and edits beforeSubmitPrompt - Validate prompts before submission preCompact - Observe context window compaction stop - Handle agent completion afterAgentResponse / afterAgentThought - Track agent responses Tab hooks (inline completions) fire for autonomous Tab operations: beforeTabFileRead - Control file access for Tab completions afterTabFileEdit - Post-process Tab edits App lifecycle hooks fire outside any agent session: workspaceOpen"
  prefix: ") fire during an agent session: "
  suffix: " - Fires when Cursor opens a wor"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-09T12:00:00Z
---

> sessionStart / sessionEnd - Session lifecycle management preToolUse / postToolUse / postToolUseFailure - Generic tool use hooks (fires for all tools) subagentStart / subagentStop - Subagent (Task tool) lifecycle beforeShellExecution / afterShellExecution - Control shell commands beforeMCPExecution / afterMCPExecution - Control MCP tool usage beforeReadFile / afterFileEdit - Control file access and edits beforeSubmitPrompt - Validate prompts before submission preCompact - Observe context window compaction stop - Handle agent completion afterAgentResponse / afterAgentThought - Track agent responses Tab hooks (inline completions) fire for autonomous Tab operations: beforeTabFileRead - Control file access for Tab completions afterTabFileEdit - Post-process Tab edits App lifecycle hooks fire outside any agent session: workspaceOpen
