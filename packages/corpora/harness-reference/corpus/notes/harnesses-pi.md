---
title: 'pi: harness notes for a dispatcher'
description: How the pi coding agent (0.84.3 and 1.1.0) selects models, opens, resumes and forks sessions, and runs headlessly.
retrieved: 2026-09-25
checked: 2026-10-09
---

# pi: harness notes for a dispatcher

Source: `pi --help`, and the installed package's own docs (`docs/rpc.md`, `docs/sessions.md`,
`docs/tmux.md` under `@earendil-works/pi-coding-agent`), pi 0.84.3, examined 2026-09-25.

## Verified

Checked on 2026-10-09 against pi 1.1.0, `pi --help`, the package's `docs/cli.md` and
`docs/models.md`, and live runs against Ollama 0.40.0.

| Concern | Flag or setting | Verified behaviour |
| --- | --- | --- |
| Model | `--model <pattern>` | Exact id or fuzzy match; `provider/id` selects the provider too |
| Provider | `--provider <name>` | Narrows `--model` lookup; a `provider/` prefix does the same |
| Effort | `--thinking <level>` | `off minimal low medium high xhigh max`; clamped to the model |
| Effort, suffix | `--model <m>:<level>` | Same levels; `--thinking` overrides the suffix |
| Context | none | `contextWindow` per model in `~/.pi/agent/models.json` |
| Model list | `--list-models [search]` | Provider, model, context, max-out, thinking, images |
| Prompt guard | `--` | Ends option parsing; the rest are messages or `@files` |

Findings that shape routing:

- **Ollama is not a built-in provider.** It needs a `providers.ollama` entry in
  `~/.pi/agent/models.json` (`baseUrl: http://localhost:11434/v1`, `api: openai-completions`, a
  dummy `apiKey`, and a `models` list). Without it `--list-models` prints "No models available".
- **An Ollama tag survives the `:` suffix.** `--model ollama/qwen3:4b` ran `qwen3:4b` at the
  model's default thinking (`medium`); `ollama/qwen3:4b:low` ran it at `low`;
  `ollama/granite4:latest` ran `granite4:latest`. Passing effort as `--thinking`, never as a
  suffix, keeps the tag from being read as a level.
- **An unlisted model is tried anyway.** `--model ollama/nosuch:1b` warns `Model "nosuch:1b" not
  found for provider "ollama". Using custom model id.`, gets Ollama's 404 and exits 1.
- **Argv:** `pi --model <provider/id> --thinking <level> -- <prompt>`.

Manual check, with a scratch `PI_CODING_AGENT_DIR` holding only the Ollama `models.json`:

```text
$ pi --offline --no-session -p --model ollama/granite4:latest -- "reply with the word ok"
ok
$ pi --offline --no-session -p --mode json --model ollama/qwen3:4b --thinking low \
    -- "reply with the word ok"
message_end: {"provider":"ollama","model":"qwen3:4b","stopReason":"stop","text":["ok"]}
thinkingLevel: "low"
```

## Open with a known id and name

- **Verified.** `pi --session-id <id>` opens a session under an exact id, creating it if it does
  not exist. `--name/-n <name>` sets its display name at startup. The two compose:
  `pi --session-id <id> --name "<name>"`.

## Resume by id with a prompt

- **Verified.** `pi --session <path|id>` resumes a specific session, by full file path or partial
  UUID, and accepts trailing prompt arguments. `pi -c/--continue` resumes the most recent session
  for the working directory; `pi -r/--resume` opens an interactive picker. `pi --fork <path|id>`
  forks a session into a new one instead of continuing it in place.

## Native send to a live session

- **Verified** (from the package's `docs/rpc.md`). `pi --mode rpc` runs pi as a JSON-over-stdio
  protocol: `prompt`/`steer`/`follow_up` commands sent as JSON lines on stdin are delivered into
  that one running process, which streams typed events back on stdout. `steer` queues a message
  for delivery once the current tool calls finish; `follow_up` queues one for after the whole run
  settles — both require RPC mode already running.
- **Inferred.** This is a send channel into a process the dispatcher itself spawned and holds stdin
  for — the same shape as Claude's `--input-format stream-json` (see
  [`harnesses-claude.md`](harnesses-claude.md)). It is not a way to reach a `pi` TUI that is already
  running as an independent process in some terminal: RPC mode is chosen at launch (`--mode rpc`),
  not attached to afterward. `pi --help` has no attach-by-pid or attach-by-session-id command that
  would make that possible.

## Headless mode

- **Verified.** `pi -p/--print` processes one prompt and exits, text mode by default.
  `--mode json` gives one-shot JSON output; `--mode rpc` is the standing, multi-turn headless
  protocol described above.

## Notable

pi ships its own `docs/tmux.md`, but it covers only keyboard-modifier forwarding
(`extended-keys-format csi-u`) for running pi's TUI inside tmux. It says nothing about tmux as a
session-discovery or send mechanism for pi.
