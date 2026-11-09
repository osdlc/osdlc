---
id: R-03
type: research
state: current
created: 2026-09-26
---

# Host research: Agent status: working, idle, needs input

How terminal hosts learn whether an agent session is working, idle, or blocked on the user, and
which of those signals a dispatcher can read or produce itself.

Examined 2026-09-25 against: Orca 1.4.211 (installed bundle at
`/Applications/Orca.app/Contents/Resources/`), cmux 0.64.17 (`/Applications/cmux.app`, docs at
`manaflow-ai/cmux` main), Claude Code 2.1.283, codex-cli 0.155.1, pi 0.84.3
(`@earendil-works/pi-coding-agent`), and Claude Squad (`smtg-ai/claude-squad` main). Each fact is
marked **verified** (read or run directly) or **inferred**. Orca paths below are relative to
`app.asar.unpacked/out/` unless stated. Hook tokens and screen previews are redacted.

## Summary

Signal sources, most reliable first:

1. **Harness hooks.** The harness itself runs a command on each lifecycle event. Orca and cmux
   both build their status on hooks. Claude Code and Codex have a hook system; pi has an in-process
   extension API that does the same job. Hooks give all four states: delivered, working, idle, and
   needs input.
2. **Harness-owned state files and listings.** Claude Code keeps `~/.claude/sessions/<pid>.json`
   with `status: busy|idle|waiting` and `waitingFor`, and `claude agents --json` prints it. It
   needs no hooks. Claude only.
3. **Host-aggregated status.** Orca exposes its hook-derived per-pane state through
   `orca worktree ps --json` (`agents[].state`). cmux stores lifecycle per session in
   `~/.cmuxterm/<agent>-hook-sessions.json`. Both depend on the host's own hooks being installed.
4. **Terminal title (OSC 0/2).** Claude Code shows `✳` when idle and a spinner glyph when
   working. Orca's pi extension writes `π : …` (working), `π > …` (idle), `π ! …` (needs input).
   Cheap, but a heuristic: it only works while the title is not overwritten, and it does not
   distinguish "idle" from "waiting on a permission prompt" for Claude.
5. **Screen scraping.** Orca's `terminal wait --for tui-idle` and Claude Squad match known strings
   on screen ("Allow once", "No, and tell Claude what to do differently", "press enter to
   continue") plus output quiescence. Brittle across harness versions.
6. **Output activity.** VibeTunnel's active/idle indicator and Orca's `lastOutputAt` only say
   whether bytes flowed recently.
7. **Prompt-embedded acknowledgment.** Asking the model to run an ack command. Least reliable; see
   below.

For our dispatcher: inject our own hooks per session (Claude `--settings`, Codex `-c`, pi `-e`)
so we get the same events the hosts get, without editing the user's global config. Use Claude's
session file and Orca's `worktree ps` as read-only cross-checks.

## Orca

### Hook installation (verified)

- Orca installs **global** managed hooks. For Claude Code it writes into `~/.claude/settings.json`
  (function `rn()` in `main/chunks/managed-agent-hook-controls-CDxurQ0D.js` returns
  `join(homedir(), '.claude', 'settings.json')`). The user's settings file currently holds Orca
  entries for `SessionStart`, `UserPromptSubmit`, `Stop`, `StopFailure`, `SubagentStart`,
  `SubagentStop`, `TeammateIdle`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`,
  `PermissionRequest`, `PostCompact`, `SessionEnd`. Each calls
  `~/.orca/agent-hooks/claude-hook.sh`.
- For Codex it writes `~/.codex/hooks.json` (`SessionStart`, `UserPromptSubmit`, `PreToolUse`,
  `PostToolUse`, `PermissionRequest`, `SubagentStart`, `SubagentStop`, `Stop`), calling
  `~/.orca/agent-hooks/codex-hook.sh`. Codex records a `trusted_hash` per hook under
  `[hooks.state]` in `~/.codex/config.toml`.
- For pi it installs extensions in `~/.pi/agent/extensions/`: `orca-agent-status.ts`,
  `orca-titlebar-spinner.ts`, `orca-prefill.ts`, each tagged `// @orca-managed-pi-extension`.
- The managed target list is `shared/agent-hook-types.js` `AGENT_HOOK_TARGETS` (claude,
  openclaude, codex, gemini, antigravity, amp, cursor, droid, command-code, grok, copilot, hermes,
  devin, kimi, muse). pi is handled by the extension path, not this list.

### Transport (verified)

- Every Orca pane gets env vars: `ORCA_PANE_KEY` (`<tabId>:<leafId>`), `ORCA_TAB_ID`,
  `ORCA_WORKTREE_ID`, `ORCA_TERMINAL_HANDLE`, `ORCA_AGENT_LAUNCH_TOKEN`, `ORCA_AGENT_HOOK_PORT`,
  `ORCA_AGENT_HOOK_TOKEN`, `ORCA_AGENT_HOOK_ENV`, `ORCA_AGENT_HOOK_VERSION`,
  `ORCA_AGENT_HOOK_TRANSPORT=raw-json-v1`, and `ORCA_AGENT_HOOK_ENDPOINT` (a file,
  `~/Library/Application Support/orca/agent-hooks/endpoint.env`, with the same `KEY=VALUE` lines;
  parsed by `shared/agent-hook-endpoint-file.js`).
- `claude-hook.sh` prints `{}` to stdout, reads the hook JSON from stdin, and exits early when
  `ORCA_PANE_KEY` or the port/token are missing. Otherwise it POSTs the payload to
  `http://127.0.0.1:${ORCA_AGENT_HOOK_PORT}/hook/claude` with header `X-Orca-Agent-Hook-Token`
  and the pane metadata. On failure it appends to a spool file
  `<endpoint dir>/spool/pane-<id>.jsonl` (skipping PreToolUse/PostToolUse noise).
- So the hooks are global, but they are no-ops outside an Orca pane. A dispatcher's own session in
  an Orca pane fires both Orca's hooks and ours.

### Event to state mapping (verified)

States are `working`, `blocked`, `waiting`, `done` (`shared/agent-status-types.js`
`AGENT_STATUS_STATES`). The file header says status "comes from hooks … never inferred from
terminal titles".

Claude (`shared/agent-hook-listener/providers/claude-events.js`):

```js
const reportedStateName = eventName === 'UserPromptSubmit' ||
    eventName === 'PostToolUse' || eventName === 'PostToolUseFailure' ||
    (eventName === 'PreToolUse' && !isAskUserQuestion)
    ? 'working'
    : eventName === 'PermissionRequest' || isAskUserQuestion
        ? 'waiting'
        : isTurnBoundary || isManualCompactCompletion   // Stop, StopFailure, PostCompact(manual)
            ? 'done'
            : null;
```

- `SessionStart` lands a `done` row (a fresh session is idle).
- `AskUserQuestion` shows up as `PreToolUse` (or `PermissionRequest` on newer builds) and is
  treated as `waiting`.
- Orca does **not** subscribe to Claude's `Notification` event.

Codex (`providers/codex-events.js`, `codex-state.js`): `SessionStart`, `UserPromptSubmit`,
`PreToolUse`, `PostToolUse` → `working`; `PermissionRequest` or a user-input `PreToolUse` →
`waiting`; `Stop` → `done`.

pi (`providers/pi-family-events.js`): `before_agent_start`, `agent_start`, `tool_call`,
`tool_execution_start/end`, `message_end` → `working`; `agent_end` → `done`; `ui_prompt_start`, an
ask-user tool call, or OMP `tool_approval_requested` → `waiting`/`blocked`; `ui_prompt_end` →
`done` or `working` by `is_idle`.

### Title heuristics (verified)

`shared/agent-title-status.js` `computeAgentStatusFromTitle` classifies an OSC title into
`working`, `idle`, or `permission`:

- Claude: title starting with `✳` (`CLAUDE_IDLE = '✳'`) → idle. Any spinner glyph (braille
  `U+2800–28FF`, quarter circles `◐◑◒◓`) → working.
- pi/OMP: `π :` working, `π >` idle, `π !` permission (`shared/pi-state-title-marker.js`).
- Gemini has its own glyphs (`✦` working, `◇` idle, `✋` permission).
- Titles containing "action required", "permission" or "waiting" next to a known agent name →
  permission.
- Live check: `orca terminal list --json` showed Claude panes titled `✳ <name>` when idle and
  `◐ <name>` while working (verified on this machine, 2026-09-25).

### OSC 9999 status channel (verified present; use by third parties inferred)

`shared/agent-status-osc.js` strips `ESC ] 9999 ; <json> BEL|ST` from the PTY stream and parses
the JSON with `parseAgentStatusPayload` (fields `state`, `prompt`, `agentType`, …). The same
parser is in the packed `app.asar` main code. Any process in an Orca pane can, in principle,
print this sequence to set the pane's status. Not tested.

### `terminal wait --for tui-idle` (verified, from the packed `app.asar`)

The runtime is only in `app.asar` (minified). A waiter resolves:

- **blocked** (`status: "permission"`, a `blockedReason`) when a screen matcher finds a known dialog
  in the tail buffer. The trigger regex matches phrases such as "update available", "choose working
  directory to", "codex just got an upgrade", "hooks need review", "do you trust"/"trust this"/
  "trusted workspace", "press enter to confirm/continue/view/insert", "press t to trust",
  "permission required"/"requires permission", "allow once"/"allow always", and "run this command?".
  Reasons include `agent-update-prompt`, `agent-cwd-prompt`, `agent-hooks-review-prompt`,
  `agent-trust-workspace`, `agent-interactive-prompt`
  (`shared/terminal-wait-blocked-reason-legacy-alias.js`, which has the exact pattern).
- **satisfied** when the title classifies as idle, or the screen shows an agent's ready prompt
  (e.g. Codex's "openai codex … model: … directory:" banner), or the last title status was idle
  and output has been quiet for a quiescence window. A fresh non-done hook status vetoes the
  quiescence path.

So `tui-idle` is a mix of title, screen and quiet time, gated by hook state when present. It
answers "ready for input", not "finished my task".

### What the CLI exposes (verified, live)

- `orca terminal list --json` / `show --json`: `title`, `agentIdentity` (`claude`, `codex`, …),
  `lastOutputAt`, `connected`, `tabId`, `leafId`. `show` also has `agentWait` (was `null` on every
  pane checked; set to `{ reason, source }` when a blocking dialog is detected). No hook state.
- `agentIdentity` comes from a priority chain: live hook agent type, then the launch intent, then
  the foreground process, then the title (packed code: `aqa({hookAgent, hookIsLive, launchAgent,
  foregroundAgent, title})`).
- `orca worktree ps --json` carries the hook state: each worktree has `status`
  (`working|active|inactive`) and `agents[]` with `paneKey`, `state`
  (`working|blocked|waiting|done`), `agentType`, `prompt`, `lastAssistantMessage`, `toolName`,
  `toolInput`, `interrupted`, `stateStartedAt`, `updatedAt`. Join to a terminal by
  `paneKey == tabId + ":" + leafId`. Checked live: this session's pane showed `state: working`.
- `orca agent-context --json` is only the command schema (`schemaVersion`, `commandCount`,
  `commands`). It holds no live state.

## cmux

Verified: cmux 0.64.17 installed; `cmux docs agents` points at
`manaflow-ai/cmux` `docs/agent-hooks.md`, `docs/feed.md`, `docs/notifications.md`.

- **Claude Code, per session.** `Resources/bin/cmux-claude-wrapper` shadows `claude` inside a
  cmux terminal (`CMUX_SURFACE_ID` set). It injects `--session-id` and one `--settings <json>`
  that adds hooks for `SessionStart`, `Stop`, `SubagentStop`, `SessionEnd`, `Notification`,
  `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, each running `cmux hooks claude <event>`.
  It deep-merges any user `--settings` into its own so only one `--settings` reaches Claude. The
  wrapper's comment: "Claude Code merges --settings additively with the user's own
  settings.json." It also sets `"preferredNotifChannel": "notifications_disabled"` so Claude's own
  OSC notifications stop and hooks are the only source.
- The wrapper's comments give two edge cases (verified text, behavior inferred): under
  `bypassPermissions`, Claude fires no `PermissionRequest`/`Notification` for `AskUserQuestion`
  and `ExitPlanMode`, so cmux flags needs-input from `PreToolUse` on those tools. `SessionEnd`
  covers Ctrl+C, where `Stop` does not fire.
- **Other agents, global.** `cmux hooks setup` writes `~/.codex/hooks.json` and
  `~/.codex/config.toml` for Codex, and `~/.pi/agent/extensions/cmux-session.ts` for pi. Not
  installed on this machine.
- **State store.** Hooks write `~/.cmuxterm/<agent>-hook-sessions.json` with lifecycle `running`,
  `idle`, `needsInput`, or `unknown`, plus session id, workspace, surface, cwd and pid (docs).
- **Notifications.** `cmux notify --title … --body …` posts to a panel; cmux also accepts OSC
  9/99/777 escape notifications. Agent-originated notifications carry a category:
  `turn-complete`, `needs-permission`, or `idle-reminder` (docs). CLI surface: `list-status`,
  `set-status`, `list-notifications`, `events` (a stream), `read-screen`.

## Harness-native signals

### Claude Code 2.1.283

Hooks (verified from the docs at code.claude.com/docs/en/hooks, 2026-09-25):

- Relevant events: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`,
  `PostToolUse`, `Notification`, `Stop`, `StopFailure`, `SubagentStart`, `SubagentStop`,
  `SessionEnd`, `Elicitation`.
- `Notification` matchers include `permission_prompt`, `idle_prompt`, `elicitation_dialog`,
  `agent_needs_input`, `agent_completed`.
- Common payload: `session_id`, `prompt_id`, `transcript_path`, `cwd`, `permission_mode`,
  `hook_event_name`, plus `agent_id`/`agent_type` inside subagents.
- Where: `~/.claude/settings.json`, `.claude/settings.json`, `.claude/settings.local.json`,
  managed policy, plugin `hooks/hooks.json`, skill and subagent frontmatter, and the `--settings`
  flag ("Current session").
- Handler types: `command`, `http` (POST to a URL, needs `allowedHttpHookUrls` if set), `mcp_tool`,
  `prompt`, `agent`. Command hooks can be `async: true`.
- Risks: `disableAllHooks` or `allowManagedHooksOnly` in policy turns our hooks off. `--bare`
  skips settings and plugin hooks (verified in `claude --help`).

Per-session injection (verified in `claude --help`; additive merge verified from cmux's
production wrapper, not tested by us): `claude --settings '<json or file>'` loads "additional
settings". This does not touch the user's settings files.

Native status without hooks (verified, live):

- `~/.claude/sessions/<pid>.json` holds `sessionId`, `cwd`, `status` (`busy`, `idle`, `waiting`),
  `waitingFor` (e.g. `"permission prompt"`), `statusUpdatedAt`, `name`, and a
  `messagingSocketPath`. This is an internal file with no documented contract.
- `claude agents --json` prints "active sessions (interactive and background)". Fields: `pid`,
  `sessionId`, `cwd`, `name`, `kind` (`interactive|background`), `startedAt`, `status`
  (`busy|idle|waiting`, interactive), `state` (e.g. `blocked`, background), `waitingFor`. Live
  run: 24 idle, 2 busy, 1 waiting with `waitingFor: "permission prompt"`, 4 background blocked.
  This session showed `busy`. Re-verified 2026-09-26 against Claude Code 2.1.283: an all-interactive
  listing showed only `pid`, `cwd`, `kind`, `startedAt`, `sessionId`, `name`, `status`,
  `waitingFor` — no top-level `id` field, so that field is dropped from the list above. `state`
  is for background sessions and was not re-observed since no background sessions were running at
  either check; its absence here is inconclusive, not a second discrepancy.

Terminal title (verified on screen via Orca; mechanism inferred): Claude sets an OSC title of
`✳ <session name>` when idle and a spinner glyph plus name while working. It does not show a
distinct title for a permission prompt.

### Codex 0.155.1

- **Hooks** (verified from docs at learn.chatgpt.com/docs/hooks and the user's `hooks.json`):
  events `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`,
  `PostToolUse`, `PreCompact`, `PostCompact`, `SubagentStart`, `SubagentStop`, `Stop`,
  `Interrupt`. There is no `Notification`/idle event. Payload: `session_id`, `transcript_path`,
  `cwd`, `hook_event_name`, `model`, `permission_mode`, plus `turn_id` on turn events. Config:
  `~/.codex/hooks.json`, `~/.codex/config.toml` `[hooks]`, the project `.codex/` layer (trusted
  projects only), or a plugin. Feature `hooks` is `stable`/`true` (`codex features list`).
- **Hook trust** (verified): non-managed hooks are skipped until trusted; trust is a hash stored
  under `[hooks.state]`. A new hook shows a "hooks need review" dialog (Orca's screen matcher
  looks for exactly that). `--dangerously-bypass-hook-trust` runs enabled hooks without
  persisted trust "for this invocation".
- **notify** (verified from docs): `notify = ["prog", …]` runs a program on `agent-turn-complete`
  only, with one JSON argument: `type`, `thread-id`, `turn-id`, `cwd`, `input-messages`,
  `last-assistant-message`. The user's config already sets `notify` to the Codex Computer Use
  client, so overriding it with `-c` would replace that for the session (inferred).
- **TUI notifications** (verified from docs): `tui.notifications` (true, or a list of
  `agent-turn-complete`, `approval-requested`), `tui.notification_method` (`auto`, `osc9`, `bel`),
  `tui.notification_condition` (`unfocused`, `always`). With `always` + `osc9`, a host that parses
  OSC 9 gets both turn-complete and approval events.
- **Per session** (inferred): `-c key=value` overrides any config key as TOML, so
  `-c 'hooks.Stop=[…]'` or `-c 'notify=[…]'` should work without editing `config.toml`. Inline
  hooks may still need trust, which is what `--dangerously-bypass-hook-trust` is for. Not tested.

### pi 0.84.3

- **Extensions** (verified, `docs/extensions.md`): TypeScript modules loaded from
  `~/.pi/agent/extensions/`, project `.pi/extensions/` (trusted projects only), `settings.json`
  `extensions`, or `pi -e <path>` per invocation (`--extension, -e`, repeatable;
  `--no-extensions` still honors explicit `-e`).
- Events: `session_start`, `input`, `before_agent_start`, `agent_start`, `turn_start/end`,
  `message_*`, `tool_call`, `tool_execution_start/end`, `agent_end`, `agent_settled`,
  `session_shutdown`. The docs say to use `agent_settled` "for status integrations that need to
  know Pi will not continue running automatically."
- An extension runs in-process with full permissions. It can post to a socket or HTTP endpoint,
  write a file, or set the title (`ctx.ui.setTitle`). Orca's `orca-agent-status.ts` does exactly
  this.
- **Needs input**: pi has "No permission popups" (README). The only blocking prompts come from
  extensions (`ctx.ui.confirm/select/input`). Orca's extension listens for `ui_prompt_start` /
  `ui_prompt_end`, but those names do not appear anywhere in the installed pi 0.84.3 package
  (verified by grep). They are likely OMP-only or from a newer pi (inferred).
- **RPC mode** (`--mode rpc`, `docs/rpc.md`) streams the same events as JSON over stdout, but only
  for a process the caller spawned and owns stdin for (see the pi
  harness research, kept outside this package).

## Other tools

- **Claude Squad** (verified, `session/tmux/tmux.go` on main): hashes the tmux pane every tick;
  changed content means working. `hasPrompt` is a string match: `"No, and tell Claude what to do
  differently"` (claude), `"(Y)es/(N)o/(D)on't ask again"` (aider), `"Yes, allow once"`
  (gemini). No hooks.
- **VibeTunnel** (verified, README): "Activity indicators are based on recent input/output and
  drive active/idle UI states." No agent-specific signal.
- **Conductor, Crystal**: not examined. Conductor is closed source; Crystal's README could not be
  fetched.

## Prompt-embedded acknowledgment

Idea: every dispatched message starts with "first run `sdlc dispatch ack <id>`".

- It depends on the model obeying. A model can skip it, reorder it, or run it late after other
  tools. A missing ack is ambiguous: not delivered, or delivered and ignored.
- It costs a tool call and tokens every message, and puts dispatcher plumbing in the transcript.
- It needs the ack command to be allowed by the permission policy, or it stalls on a permission
  prompt, which is the state we are trying to detect.
- It only reports "the model read the message". It says nothing about idle or needs-input.
- `UserPromptSubmit` gives the same "delivered" signal deterministically, before the model runs,
  with the prompt text in the payload so we can match our id.

Verdict (inferred): use it only as a last resort for a harness with no hook or extension API.

## Recommendation for the dispatcher

Signals per harness:

| State | Claude Code | Codex | pi |
| --- | --- | --- | --- |
| delivered | `UserPromptSubmit` (match our id in `prompt`) | `UserPromptSubmit` | `input` or `before_agent_start` |
| working | `UserPromptSubmit`, `PreToolUse`, `PostToolUse` | `UserPromptSubmit`, `PreToolUse`, `PostToolUse` | `agent_start`, `tool_*` |
| idle (turn done) | `Stop` / `StopFailure`; `Notification[idle_prompt]` | `Stop`; `notify` agent-turn-complete | `agent_settled` |
| needs input | `PermissionRequest`, `Notification[permission_prompt]`, `PreToolUse[AskUserQuestion,ExitPlanMode]` | `PermissionRequest`; `PreToolUse` for user-input tools | extension-owned dialogs only |
| ended | `SessionEnd` | `SessionEnd` | `session_shutdown` |
| no-hook fallback | `~/.claude/sessions/<pid>.json` / `claude agents --json` | Orca `worktree ps`, screen match | Orca `worktree ps`, `π` title marker |

Injecting per session, without touching global config:

- **Claude**: launch with `--settings '<json>'` whose hooks run one small reporter command (or an
  `http` hook to a local endpoint). Include `Notification` with matchers. Pass the dispatch id
  through an env var on the launched process; hooks inherit the environment (inferred from how
  Orca's and cmux's hooks read their env). If the user passes their own `--settings`, merge into
  one, as cmux does.
- **Codex**: launch with `-c 'hooks.<Event>=[…]'` for the events above, plus
  `--dangerously-bypass-hook-trust` so the injected hooks are not held for review. Only the
  dispatcher's own reporter runs under that flag. Needs a live test.
- **pi**: launch with `-e <our-extension>.ts` that subscribes to the events above and writes to
  our endpoint.
- **Reporter**: one command that reads the hook JSON on stdin, tags it with the dispatch id and
  the harness `session_id`, and appends to a per-session file or posts to a local socket. It must
  print `{}` and exit 0 quickly so it never blocks the agent. Mark it `async` where supported.
- **Sessions we did not launch** (already running under Orca): read `orca worktree ps --json` and
  join `agents[].paneKey` to the terminal's `tabId:leafId`. For Claude, also read
  `~/.claude/sessions/*.json` by `sessionId`.
- Treat title and screen checks as a last fallback, and treat a timeout as "unknown", not busy.

## Context usage and compaction

Examined 2026-09-26, same versions as above. Used to tell when a session is too full to keep.

| Harness | Tokens in use | Window size | Compaction signal |
| --- | --- | --- | --- |
| Claude Code | Last assistant `usage` in the transcript JSONL: `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens` (verified, local transcript) | Not in the transcript. The statusline stdin has `context_window.context_window_size`, `used_percentage`, `remaining_percentage`, `current_usage` (verified, code.claude.com/docs/en/statusline) | `PreCompact` / `PostCompact` hooks, matcher `manual` or `auto`; `SessionStart` source `compact` (verified, hooks docs). Transcript record `subtype: compact_boundary` with `compactMetadata.trigger`, `preTokens`, `postTokens` (verified, local transcript) |
| Codex | `event_msg` `token_count` in the rollout file (`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`): `info.last_token_usage` and `info.total_token_usage` (verified, local file) | `info.model_context_window` on the same event (verified). Config keys `model_context_window`, `model_auto_compact_token_limit` exist (verified, binary strings) | `PreCompact` / `PostCompact` hooks (verified, docs) |
| pi | `ctx.getContextUsage()` in an extension (verified, `docs/extensions.md`) | Same call, for the active model (inferred) | `session_before_compact`, `session_compact`, `session_compact_failed`; reason `manual`, `threshold` or `overflow` (verified). `ctx.compact()` triggers one (verified) |

- Claude Code has `--autocompact <auto|tokens>` to set the auto-compact window (verified,
  `claude --help`).
- A session runs one statusline command, so a dispatcher that injects its own through
  `--settings` would replace the user's (inferred).
- `/compact` exists in Claude Code (hooks docs) and pi (`docs/extensions.md`) (verified). In
  Codex it is inferred, not checked.

## Session liveness and expiry

- Claude Code deletes transcripts after `cleanupPeriodDays` (verified, settings reference). A
  resume of a deleted session cannot keep its context (inferred; `claude --resume` on a deleted id
  was not run).
- `~/.claude/sessions/<pid>.json`: all 26 files on this machine named a live pid (verified,
  2026-09-26). So the file is likely removed on exit (inferred). Whether a crash leaves it behind
  is not known.
- Clean exit fires `SessionEnd` (Claude Code, Codex) or `session_shutdown` (pi) (verified, docs
  above). A crash fires nothing (inferred).

## Unknowns

- Whether `codex -c 'hooks.…=[…]'` is accepted as an inline hook table, and whether it still
  needs trust without `--dangerously-bypass-hook-trust`.
- Whether `claude --settings` hooks run in addition to global hooks in every mode. cmux relies on
  it; we have not run it.
- Whether a third-party OSC 9999 write actually updates Orca's pane status.
- The format stability of `~/.claude/sessions/<pid>.json`. It is undocumented.
- Which pi version, if any, emits `ui_prompt_start`/`ui_prompt_end`.
- How cmux's "built-in prompt-turn detection" works for agents without hooks.
- Conductor and Crystal status detection.
- What `claude --resume <id>` prints when the transcript is gone.
- Whether a crashed Claude Code process leaves its `~/.claude/sessions/<pid>.json` behind.
- Whether Claude Code's `Stop` payload carries the last assistant message.
- Whether Codex's TUI accepts `/compact`.
