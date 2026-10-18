---
id: D-09
type: decision
state: accepted
created: 2026-10-18
---

# D-09: More built-in agents

## Decision

- Six agents join the four built-in ones, in one minor release: `copilot`
  (GitHub Copilot CLI), `pi`, `qwen` (Qwen Code), `droid` (Factory Droid),
  `cursor` (Cursor CLI) and `deepseek` (DeepSeek Harness, `dsh`).
- `AgentName` stays a closed union and `BUILTIN_AGENTS` lists the new names
  after the existing four. Adding names to the union is marked `Breaking` in
  the CHANGELOG: an exhaustive `switch` over `AgentName` stops compiling.
- The parser for Claude Code's result envelope and event stream moves to
  `src/adapters/claude-style.ts`. claude, qwen and cursor use it, and droid
  uses its envelope fields.
- These CLIs get no built-in adapter, for the reasons below:
  - Aider and Crush have no machine-readable output. `templateAdapter` covers
    them, and the README shows how.
  - Amp has no model flag and no read-only posture.
  - Goose's JSON output carries no session id.
  - The Gemini CLI was replaced by the Antigravity CLI for free-tier users,
    and `antigravity` is built in.
  - Cline, Kimi Code, Grok Build, Mistral Vibe and Kiro do not document their
    JSON output well enough to parse.
  - OpenHands CLI is unmaintained, Plandex's cloud service is shutting down,
    and Warp runs agents in the cloud.
- A DeepSeek model needs no adapter of its own. `deepseek` runs DeepSeek's own
  harness. Other adapters reach the models through a provider:
  - `opencode` and `pi`, with the model `deepseek/<id>`.
  - `claude`, with `ANTHROPIC_BASE_URL` set to DeepSeek's Anthropic-compatible
    endpoint.

## Why

- A survey of 25 harnesses on 2026-10-18 ranked these six highest. Each has a
  one-shot mode, machine-readable output with a session id, and a wide user
  base or a vendor behind it. They cover the vendors the four built-ins left
  out: GitHub, Alibaba, Factory, Cursor and DeepSeek, and pi for any provider.
- Several of them copy Claude Code's output shape, so a shared parser makes
  each of those adapters mostly a flag map.
- Each name added to the union breaks an exhaustive switch once. Six names in
  one release break it once, not six times.
- An open `AgentName` (any string) would have made `adapterFor` total only at
  run time, and would lose the exhaustiveness the contract test relies on.

## Consequences

- The capability map gains a second table, with a column for each new
  agent. `tests/contract.test.ts` checks every cell of the new columns.
- Each adapter was checked against its CLI's `--help` output and source, at
  the version the README names. pi, qwen, copilot, droid and deepseek fixtures
  were captured from real runs against a local fake model server, since no API
  key was used. cursor's fixtures come from its real CLI run against a fake
  Cursor backend, because its backend speaks Cursor's own protocol. The live
  suite has no case for the new adapters until someone with credentials runs
  them.
- DeepSeek Harness is a developer preview. Its adapter targets the version
  the README names, and later releases may break it.
