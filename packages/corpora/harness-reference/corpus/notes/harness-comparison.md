---
title: Harness comparison
description: Survey of the major coding-agent harnesses, how each is configured, and what it takes to publish skills and config into each.
retrieved: 2026-08-08
updated: 2026-10-09
---

# Harness comparison

Survey of the major coding-agent harnesses: what each is, how each is configured, and what it
would take to publish into it. Researched 2026-08-08 from official docs by parallel web-research
agents; every fact was current that day. Verify a row before building against it.

## The finding: the market converged

Three standards now carry most of the field:

| Standard | What | Adoption |
|---|---|---|
| Agent Skills (agentskills.io) | `SKILL.md` folder with `name`/`description` frontmatter, `scripts/` `references/` `assets/` | ~40 listed adopters incl. Claude Code, Codex, Copilot, Cursor, Gemini CLI, OpenCode, Amp, Goose, Kiro, pi, Factory |
| `AGENTS.md` | Instruction file, walked up from cwd, concatenated | Anchored into the Linux Foundation's Agentic AI Foundation (Dec 2025, with MCP and goose). Read by Codex, Qwen Code, Cursor, Copilot CLI, Grok Build, pi, OpenCode, Amp, Goose and Kiro (see the configuration table below). Claude Code does not read it natively and needs an `@AGENTS.md` import |
| Neutral skill dirs | `.agents/skills/` (project), `~/.agents/skills/` (global) | Read natively by Codex, Gemini, Cursor, Copilot, OpenCode, Amp, Goose, pi, Grok Build |

And a de-facto fourth: **Claude Code's own formats are a compatibility target**. `.claude/skills/`
is read by Cursor, Copilot, OpenCode, Amp, Goose, and Grok Build; `CLAUDE.md` by
OpenCode, Copilot, pi, and Grok Build; Qwen Code auto-converts whole Claude plugins; Grok Build
reads the entire Claude surface (rules, skills, hooks, MCP, marketplaces) zero-config.

Implication: one standards-conformant projection (`.agents/skills/` + `AGENTS.md`) reaches a
dozen harnesses at once, and a Claude projection doubles as a second compatibility channel. Per-harness projections are then only needed for the surfaces that differ:
MCP config files, hooks, commands, and frontmatter supersets.

## The field

| Harness | Vendor | Form | Source | Models | Status |
|---|---|---|---|---|---|
| Claude Code | Anthropic | CLI + IDE + desktop + SDK | Closed | Anthropic only | v2.1.226 |
| Codex CLI | OpenAI | CLI (Rust) + IDE + cloud | Open, Apache-2.0 | OpenAI default, BYOM | v0.147.0 |
| Gemini CLI | Google | CLI (Node) | Open, Apache-2.0 | Gemini only | v0.54.4 — but consumer tiers sunset 2026-06-18; transitioning to Antigravity CLI |
| Qwen Code | Alibaba | CLI (Gemini fork, diverged) | Open, Apache-2.0 | Qwen + BYOM | v0.21.8 |
| Cursor | Anysphere | IDE + CLI + cloud | Closed | Multi-vendor + own | IDE 3.12.x |
| Copilot CLI | GitHub | CLI | Closed | Multi-vendor + BYO | v1.0.78, GA 2026-02 |
| Grok Build | xAI | CLI/TUI (Rust) | Apache-2.0, read-only governance | xAI default, BYOM | v1.0.0 (2026-08-07) |
| pi | Earendil (Mario Zechner) | CLI/TUI | Open, MIT | BYOM by design | v0.84.1, pre-1.0 |
| OpenCode | Anomaly (ex-SST) | TUI + CLI + server + desktop | Open, MIT | BYOM, 75+ providers | v1.18.15 |
| Amp | Amp (ex-Sourcegraph) | CLI + web | Closed | Managed routing | No version number given |
| Goose | Block → Linux Foundation | CLI + desktop (Rust) | Open, Apache-2.0 | BYOM, 15+ providers | v1.45.0 |
| Kiro | AWS | IDE + CLI + web | Closed | Anthropic + router | IDE 1.0.288, CLI 2.16.x; successor to all of Amazon Q Developer |

**Amazon Strands is not in this table deliberately**: it is an SDK for *building* agents
(Python/TS), not a harness a developer runs. It has no config surface to publish into —
system prompts are constructor arguments — with one exception: an optional plugin consumes
standard agentskills.io `SKILL.md` dirs.

## Configuration surface

| Harness | Instructions | Skills (project) | Subagents | Hooks | MCP file | Main config |
|---|---|---|---|---|---|---|
| Claude Code | `CLAUDE.md` (+ `.claude/rules/`) | `.claude/skills/` | `.claude/agents/*.md` | settings JSON `hooks` | `.mcp.json` | `.claude/settings.json` (JSON) |
| Codex | `AGENTS.md` | `.agents/skills/` | `.codex/agents/*.toml` | `.codex/hooks.json` | `config.toml` `[mcp_servers]` | `~/.codex/config.toml` (TOML) |
| Gemini CLI | `GEMINI.md` | `.gemini/skills/`, `.agents/skills/` | `.gemini/agents/*.md` | settings `hooks` | `settings.json` `mcpServers` | `.gemini/settings.json` (JSON) |
| Qwen Code | `QWEN.md` + `AGENTS.md` | `.qwen/skills/` | `.qwen/agents/*.md` (Claude-compatible) | settings `hooks` (Claude-style events) | `settings.json` `mcpServers` | `.qwen/settings.json` (JSON) |
| Cursor | `.cursor/rules/*.mdc`, `AGENTS.md` | `.cursor/skills/`, `.agents/`, `.claude/`, `.codex/` | `.cursor/agents/*.md` (+ foreign dirs) | `.cursor/hooks.json` | `.cursor/mcp.json` | `.cursor/cli.json` etc (JSON) |
| Copilot CLI | `.github/copilot-instructions.md`, `AGENTS.md`, `CLAUDE.md` | `.github/skills/`, `.claude/`, `.agents/` | `.github/agents/*.agent.md` | `.github/hooks/*.json` | `~/.copilot/mcp-config.json` | `~/.copilot/*` (JSON) |
| Grok Build | `AGENTS.md` (+ full Claude compat) | `.grok/skills/`, `.agents/skills/` | native, no file format verified | `.grok/hooks/*.json` (+ Claude/Cursor hooks) | `config.toml` `[mcp_servers]` | `.grok/config.toml` (TOML) |
| pi | `AGENTS.md` / `CLAUDE.md` | `.pi/skills/`, `.agents/skills/` | community ext only | TS extensions (no shell hooks) | none (extension-bridged) | `.pi/settings.json` (JSON) |
| OpenCode | `AGENTS.md` (+ `CLAUDE.md` fallback) | `.opencode/`, `.claude/`, `.agents/` | `.opencode/agents/*.md` | JS/TS plugins | `opencode.json` `mcp` | `opencode.json` (JSON, published schema) |
| Amp | `AGENTS.md` | `.agents/skills/`, `.claude/skills/` | plugin-defined | JS plugins | `settings.json` `amp.mcpServers` | `.amp/settings.json` (JSON) |
| Goose | `AGENTS.md`, `.goosehints` | `.agents/skills/`, `.claude/skills/` | ad-hoc (no files) | none | `config.yaml` `extensions` | `~/.config/goose/config.yaml` (YAML, global only) |
| Kiro | `.kiro/steering/*.md`, `AGENTS.md` | `.kiro/skills/` | `.kiro/agents/` (JSON or MD) | `.kiro/hooks/*.json` | `.kiro/settings/mcp.json` | `.kiro/` tree (JSON) |

Notable: subagent definition formats fork three ways (markdown+frontmatter à la Claude, TOML for
Codex, JSON for Kiro), and hooks fork between JSON-config shell hooks (Claude lineage) and
code-level plugins (OpenCode, Amp, pi). Skills are the only surface with real convergence.

## MCP transport keys

Confirmed against current docs per harness:

| Harness | File format | stdio | Streamable HTTP | SSE |
|---|---|---|---|---|
| Claude Code | JSON | `type:"stdio"` (default if omitted), `command` | `type:"http"`, `url` | `type:"sse"` (deprecated) |
| Codex | TOML | `command` | `url` | not supported |
| Gemini CLI | JSON | `command` | **`httpUrl`** | **`url`** |
| Qwen Code | JSON | `command` | **`httpUrl`** (recommended) | **`url`** (legacy) |
| Cursor | JSON | `type:"stdio"`, `command` | `url` | `url` (auto-detected) |
| Copilot CLI | JSON | `type:"local"` (`"stdio"` alias), `command` | `type:"http"`, `url` | `type:"sse"` (deprecated) |
| Grok Build | TOML | `command` | `url` | not documented |
| OpenCode | JSON | `type:"local"`, `command` (array) | `type:"remote"`, `url` | via remote |
| Goose | YAML | `type: stdio`, `cmd` | `type: streamable_http` | not documented |
| Kiro | JSON | `command` | `url` | not documented |

Gemini and Qwen confirmed: `url` selects SSE, `httpUrl` selects streamable HTTP. Key
names agree almost nowhere else either; MCP config is the least portable surface in the table and
the strongest case for per-target projection.

## Per-harness notes

**Claude Code** — the richest surface (skills, rules, agents, hooks with 30+ events, plugins with
marketplaces) and the format others copy. Custom commands merged into skills. Closed source;
formats documented and additive-stable through 2.x.

**Codex CLI** — open source, standards-based (`AGENTS.md` originated here), but its formats
have changed: skills dirs moved (`~/.codex/skills/` → `~/.agents/skills/`), custom prompts
deprecated months after launch, plugin manifest not yet documented. Target SKILL.md + AGENTS.md;
treat `config.toml` table names as version-sensitive.

**Gemini CLI** — formats are clean and documented, but the platform is sunsetting: consumer tiers
stopped being served 2026-06-18 in the transition to Antigravity CLI, which Google says carries
skills, hooks, subagents, and extensions forward. Update 2026-10-09: Antigravity's (`agy`)
migration docs specify skills at
`.agents/skills/` and MCP at `.agents/mcp_config.json` (`serverUrl`). Commands become skills
there; its hook and subagent formats are still undocumented.

**Qwen Code** — began as a Gemini fork, now deliberately Claude-shaped: reads `AGENTS.md`,
accepts Claude agent frontmatter verbatim, Claude-style hooks and permission rules, and
auto-converts Claude plugins on install. A publisher targeting Claude formats gets Qwen nearly
free.

**Cursor** — Rules are `.mdc` with frontmatter
(`alwaysApply`/`globs`/`description` decide attachment); skills follow the standard and Cursor
also reads `.claude/skills/` and `.codex/skills/`; plugins bundle skills/agents/MCP/hooks/rules
with a marketplace. Churn is real (commands deprecated into skills within a year).

**Copilot CLI** — GA since Feb 2026.
Deliberately polyglot: reads `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.claude/skills/`,
`.agents/skills/` as-is. Publishing the standard artifacts covers it without a Copilot-specific
projection; `.github/skills/` + `marketplace.json` plugins are the native channel.

**Grok Build** — xAI's official CLI, v1.0 as of 2026-08-07. Consumes the cross-tool conventions
AND the whole Claude Code surface zero-config, so it is covered for free. Caution: "open source,
closed development" (PRs rejected, issues disabled).

**pi** — minimalist by philosophy: no MCP, no permission system, no shell hooks (TypeScript
extensions instead). But standards-based where it counts — Agent Skills and `AGENTS.md` — and has
a first-class package/distribution mechanism (`pi install`, npm/git packages). Pi has no plugin
namespace, so skills from different packages share one name space. Pi has no marketplace, and a
git install cannot name a subdirectory.

**OpenCode** — the most publisher-friendly surface:
everything is checked-in files with a published JSON schema, and it reads the neutral dirs plus
Claude fallbacks.

**Amp** — skills are tractable (native repos, reads shared dirs); the rest of the config plane is
account-side SaaS and plugin code rather than declarative files.

**Goose** — Linux Foundation-hosted, skills and `AGENTS.md` native. No project-level config file
at all — context files, skills, and recipe YAMLs are the only publishable surface.

**Kiro** — AWS's live harness (Amazon Q Developer CLI is legacy, renamed/absorbed; its
`.amazonq/` tree is read for compat only). One documented `.kiro/` tree serves IDE, CLI, web, and
mobile; skills follow the standard; "Powers" use the emerging Agent Plugins format.

## What this means for a publisher

1. **A portable projection has the most reach.** Standard
   `.agents/skills/<name>/SKILL.md` (spec-core frontmatter only) plus `AGENTS.md` reaches Codex,
   Gemini, Cursor, Copilot, OpenCode, Amp, Goose, pi, and Grok Build natively.
2. **Cursor differs on rules and MCP.** `.mdc` rules plus `.cursor/mcp.json` are surfaces the
   portable projection does not reach. Copilot CLI is effectively covered by portable plus
   `CLAUDE.md`.
3. **Frontmatter discipline**: the spec-core fields are `name`, `description`, plus
   `license`/`compatibility`/`metadata`. Harness-specific supersets (Claude's `allowed-tools` and
   invocation controls, Qwen's `priority`/`paths`) belong only in that harness's projection.
4. **MCP stays per-target.** The transport-key table shows why: key names agree almost nowhere,
   confirmed by Gemini's current docs (`url` = SSE, `httpUrl` = streamable HTTP).

## Sources

Primary documentation consulted per harness, 2026-08-08: code.claude.com/docs (Claude Code) ·
github.com/openai/codex + learn.chatgpt.com/docs (Codex) · geminicli.com/docs +
developers.googleblog.com Antigravity transition post (Gemini) · qwenlm.github.io/qwen-code-docs
(Qwen) · cursor.com/docs (Cursor) · docs.github.com Copilot CLI reference (Copilot) · docs.x.ai +
github.com/xai-org/grok-build (Grok Build) · pi.dev/docs + github.com/earendil-works/pi (pi) ·
opencode.ai/docs (OpenCode) · ampcode.com/manual (Amp) · goose-docs.ai (Goose) · kiro.dev/docs +
docs.aws.amazon.com Q Developer end-of-support notice (Kiro/AWS) · strandsagents.com (Strands) ·
agentskills.io (the standard and its adopter list) · linuxfoundation.org AAIF announcement
(AGENTS.md / MCP / goose governance).
