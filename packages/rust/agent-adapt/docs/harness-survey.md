# Harness survey

A survey of the major coding-agent harnesses: what each is, how each is configured, and what it
takes to publish into it. Researched 2026-08-08 from each vendor's official documentation. Every
fact was current that day, and this field changes weekly, so check a row before building against
it. Later updates are dated where they appear.

`agent-adapt` cites this survey as the evidence for the capability claims it makes from it.

## The finding: the market converged on one artifact

Three standards now carry most of the field, and they are what `agent-adapt` renders:

| Standard | What | Adoption |
|---|---|---|
| Agent Skills (agentskills.io) | `SKILL.md` folder with `name`/`description` frontmatter, `scripts/` `references/` `assets/` | ~40 listed adopters incl. Claude Code, Codex, Copilot, Cursor, Gemini CLI, OpenCode, Amp, Goose, Kiro, pi, Factory |
| `AGENTS.md` | Instruction file, walked up from cwd, concatenated | Anchored into the Linux Foundation's Agentic AI Foundation (Dec 2025, with MCP and goose). Read by nearly everything except Claude Code (which wants `@AGENTS.md` imported) and Aider |
| Neutral skill dirs | `.agents/skills/` (project), `~/.agents/skills/` (global) | Read natively by Codex, Gemini, Cursor, Copilot, OpenCode, Amp, Goose, Crush, Factory, pi, Grok Build |

And a de-facto fourth: **Claude Code's own formats are a compatibility target**. `.claude/skills/`
is read by Cursor, Copilot, OpenCode, Amp, Goose, Crush, Cline, and Grok Build; `CLAUDE.md` by
OpenCode, Copilot, pi, and Grok Build; Qwen Code auto-converts whole Claude plugins; Grok Build
reads the entire Claude surface (rules, skills, hooks, MCP, marketplaces) zero-config.

Implication: one standards-conformant projection (`.agents/skills/` + `AGENTS.md`) reaches a
dozen harnesses at once, and a Claude Code projection doubles as a second compatibility
channel. Per-harness projections are then only needed for the surfaces that differ:
MCP config files, hooks, commands, and frontmatter supersets.

## The field

| Harness | Vendor | Form | Source | Models | Traction (2026-08) | Status |
|---|---|---|---|---|---|---|
| Claude Code | Anthropic | CLI + IDE + desktop + SDK | Closed | Anthropic only | 140.7k★ repo; ~11.4M npm dl/wk (deprecated channel) | v2.1.226, multiple releases/wk |
| Codex CLI | OpenAI | CLI (Rust) + IDE + cloud | Open, Apache-2.0 | OpenAI default, BYOM | 104.8k★; ~16.4M npm dl/wk | v0.147.0, pre-1.0 churn |
| Gemini CLI | Google | CLI (Node) | Open, Apache-2.0 | Gemini only | 106.4k★ | v0.54.4 — but consumer tiers sunset 2026-06-18; transitioning to Antigravity CLI |
| Qwen Code | Alibaba | CLI (Gemini fork, diverged) | Open, Apache-2.0 | Qwen + BYOM | 26.9k★ | v0.21.8, weekly feature drops |
| Cursor | Anysphere | IDE + CLI + cloud | Closed | Multi-vendor + own | ~$3–4B ARR; $60B SpaceX acquisition pending | IDE 3.12.x |
| Copilot CLI | GitHub | CLI | Closed | Multi-vendor + BYO | 4.7M paid Copilot subs | v1.0.78, GA 2026-02 |
| Grok Build | xAI | CLI/TUI (Rust) | Apache-2.0, read-only governance | xAI default, BYOM | 24.5k★ | v1.0.0 (2026-08-07) |
| pi | Earendil (Mario Zechner) | CLI/TUI | Open, MIT | BYOM by design | 85.6k★ | v0.84.1, pre-1.0 |
| OpenCode | Anomaly (ex-SST) | TUI + CLI + server + desktop | Open, MIT | BYOM, 75+ providers | ~195k★; 6.5M MAU claimed | v1.18.15 |
| Amp | Amp (ex-Sourcegraph) | CLI + web | Closed | Managed routing | 40k+ teams claimed | Daily releases |
| Goose | Block → Linux Foundation | CLI + desktop (Rust) | Open, Apache-2.0 | BYOM, 15+ providers | 52.6k★ | v1.45.0 |
| Kiro | AWS | IDE + CLI + web | Closed | Anthropic + router | Successor to all of Amazon Q Developer | IDE 1.0.288, CLI 2.16.x |

**Amazon Strands is not in this table deliberately**: it is an SDK for *building* agents
(Python/TS, 6.8k★), not a harness a developer runs. It has no config surface to publish into —
system prompts are constructor arguments — with one exception: an optional plugin consumes
standard agentskills.io `SKILL.md` dirs. Not a target; worth watching as the standard's reach
into custom agents.

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
formats documented and additive-stable through 2.x. Rendered by `agent-adapt`.

**Codex CLI** — open source, standards-based (`AGENTS.md` originated here), but the churniest of
the majors: skills dirs moved (`~/.codex/skills/` → `~/.agents/skills/`), custom prompts
deprecated months after launch, plugin manifest not yet documented. Target SKILL.md + AGENTS.md;
treat `config.toml` table names as version-sensitive. Rendered by `agent-adapt`.

**Gemini CLI** — formats are clean and documented, but the platform is sunsetting: consumer tiers
stopped being served 2026-06-18 in the transition to Antigravity CLI, which Google says carries
skills, hooks, subagents, and extensions forward. Update 2026-10-09: `agent-adapt` has since
moved its Gemini CLI target outright to Antigravity (`agy`), rendering only what Antigravity's
migration docs specify: skills at `.agents/skills/` and MCP at `.agents/mcp_config.json`
(`serverUrl`). Commands become skills there; its hook and subagent formats are still undocumented,
so neither is rendered.

**Qwen Code** — began as a Gemini fork, now deliberately Claude-shaped: reads `AGENTS.md`,
accepts Claude agent frontmatter verbatim, Claude-style hooks and permission rules, and
auto-converts Claude plugins on install. A publisher targeting Claude formats gets Qwen nearly
free.

**Cursor** — the largest commercial audience. Rules are `.mdc` with frontmatter
(`alwaysApply`/`globs`/`description` decide attachment); skills follow the standard and Cursor
also reads `.claude/skills/` and `.codex/skills/`; plugins bundle skills/agents/MCP/hooks/rules
with a marketplace. Churn is real (commands deprecated into skills within a year). SpaceX
acquisition pending — watch for platform shifts.

**Copilot CLI** — GA since Feb 2026 with the largest captive audience (Copilot subscribers).
Deliberately polyglot: reads `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.claude/skills/`,
`.agents/skills/` as-is. Publishing the standard artifacts covers it without a Copilot-specific
projection; `.github/skills/` + `marketplace.json` plugins are the native channel.

**Grok Build** — xAI's official CLI, v1.0 as of 2026-08-07. Consumes the cross-tool conventions
AND the whole Claude Code surface zero-config, so it is covered for free. Cautions: "open source,
closed development" (PRs rejected, issues disabled), and a July 2026 data-exfiltration incident
worth remembering in enterprise contexts.

**pi** — minimalist by philosophy: no MCP, no permission system, no shell hooks (TypeScript
extensions instead). But standards-based where it counts — Agent Skills and `AGENTS.md` — and has
a first-class package/distribution mechanism (`pi install`, npm/git packages). Pi has no plugin
namespace and no marketplace, and a git install cannot name a subdirectory.

**OpenCode** — the largest open-source traction and the most publisher-friendly surface:
everything is checked-in files with a published JSON schema, and it reads the neutral dirs plus
Claude fallbacks. Rendered by `agent-adapt`.

**Amp** — skills are tractable (native repos, reads shared dirs); the rest of the config plane is
account-side SaaS and plugin code rather than declarative files. Rendered by `agent-adapt`, skills
only.

**Goose** — Linux Foundation-hosted, skills and `AGENTS.md` native. No project-level config file
at all — context files, skills, and recipe YAMLs are the only publishable surface.

**Kiro** — AWS's live harness (Amazon Q Developer CLI is legacy, renamed/absorbed; its
`.amazonq/` tree is read for compat only). One documented `.kiro/` tree serves IDE, CLI, web, and
mobile; skills follow the standard; "Powers" use the emerging Agent Plugins format. The
enterprise/AWS bet when that audience matters.

**Field scan** — Cline (61.7k★, skills + AGENTS.md, successor to the shut-down Roo Code), Kilo
Code (26.8k★, skills marketplace), Charm Crush (27.2k★, skills + shared dirs), Factory Droid
(enterprise, skills + AGENTS.md), Mistral Vibe (skills adopter), Google Antigravity (Gemini CLI's
successor), Aider (44k★ but no skills and no AGENTS.md — poor target), Windsurf (reportedly
folded into Cognition's Devin Desktop; unverified). Roo Code shut down 2026-05; its agentskills.io
listing is stale.

## What this means for a publisher

1. **The portable projection has the widest reach.** A renderer emitting standard
   `.agents/skills/<name>/SKILL.md` (spec-core frontmatter only) plus `AGENTS.md` reaches Codex,
   Gemini, Cursor, Copilot, OpenCode, Amp, Goose, Crush, Factory, pi, and Grok Build natively —
   more coverage than any single named target, at the cost of one renderer.
2. **Cursor earns a named target** on audience: the largest commercial user base, and `.mdc` rules
   plus `.cursor/mcp.json` are surfaces the portable projection does not reach. OpenCode's
   published config schema makes it a cheap target. Copilot CLI is effectively covered by
   portable output plus `CLAUDE.md`.
3. **Low value as targets**: Gemini CLI (sunsetting into Antigravity), Amp beyond skills, Aider
   (no publishable surface), Strands (an SDK, not a harness). Kiro is the option for an
   enterprise or AWS audience.
4. **Frontmatter discipline**: emit the spec-core fields (`name`, `description`, plus
   `license`/`compatibility`/`metadata`) in portable output. Harness-specific supersets (Claude's
   `allowed-tools` and invocation controls, Qwen's `priority`/`paths`) belong only in that
   harness's projection.
5. **MCP stays per-target.** The transport-key table shows why: key names agree almost nowhere,
   and Gemini's current docs confirm `url` means SSE and `httpUrl` means streamable HTTP.

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
