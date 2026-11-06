---
title: 'Claude Code: harness notes for a dispatcher'
description: How Claude Code 2.1.283 opens, resumes, forks and runs sessions headlessly, read from its help text.
retrieved: 2026-09-25
checked: 2026-10-10
---

# Claude Code: harness notes for a dispatcher

Source: `claude --help` and `claude <subcommand> --help`, Claude Code 2.1.283, examined
2026-09-25. Every fact below is **verified** against the installed binary's help text unless
marked **inferred**.

## Open with a known id and name

- `claude --session-id <uuid> -n <name> "<prompt>"` starts a new conversation under a
  caller-chosen UUID with a display name.
- `-w/--worktree [name]` creates a new git worktree for the session; `--tmux[=classic]` (requires
  `--worktree`) opens it inside a tmux session, or iTerm2 native panes when available, instead of
  the current terminal.

## Resume by id with a prompt

- `-r/--resume <id> "<prompt>"` continues a conversation by session id and accepts a new prompt.
  With no id, it opens an interactive picker.
- `--fork-session` makes a resume create a new session id instead of reusing the original.
- `--from-pr [value]` resumes the session linked to a given PR number or URL, or opens a picker.

## Native send to a live session

- Nothing injects a message into a session that is already running. The help text for `--bg` says
  so directly: with `--resume <session-id>`, background mode "continues that session in the
  background under the same ID, or **starts a copy and says so when the session is already
  running**." Resuming a live session forks it instead of delivering into it.
- Claude Code does have its own background-session mechanism, independent of any host adapter:
  - `claude --bg "<prompt>"` starts a background session and prints a short id.
  - `claude agents --json` lists every active session — interactive and background — as JSON,
    for scripting, with no TTY required. `--all` also includes completed sessions; `--cwd <path>`
    scopes the listing to one working directory.
  - `claude attach <id>` opens a background session in the current terminal; `claude logs <id>`
    prints its recent output without attaching; `claude stop|kill <id>` stops it while keeping
    the conversation; `claude rm <id>` deletes it; `claude respawn [id]` restarts it on the
    current Claude Code build.
  - This gives Claude a native find/read/attach path that needs no terminal multiplexer such as
    tmux. It still cannot push text into a session while that session is running — `attach`
    takes over the terminal so a person can type into it, the same limit any host has.
- `-p/--print` with `--input-format stream-json` accepts realtime streaming input on the
  process's own stdin, paired with `--output-format stream-json` for streamed replies. This is a
  send channel only for a headless process the dispatcher itself spawns and owns stdin of — not a
  way to reach an independently-running interactive session. Comparable in shape to pi's
  `--mode rpc` (see [`harnesses-pi.md`](harnesses-pi.md)).

## Headless mode

- `-p/--print` runs one-shot and exits. `--output-format json|stream-json` and
  `--input-format stream-json` give structured, scriptable I/O; `--include-partial-messages`
  streams partial chunks.
- `--no-session-persistence` (print-mode only) skips saving the run, so it cannot later be
  resumed.

## Environment of a running session

Claude Code 2.1.x exports `CLAUDE_CODE_SESSION_ID` (the session id) and `CLAUDE_PID` (the claude
process pid, equal to the PPID of the shell it runs commands in) to the commands it runs. Checked in
a live 2.1.294 session.

## Notable

`claude agents --json` plus `--bg`/`attach`/`logs`/`stop`/`rm` amounts to a second, native host
mechanism for this one harness. A dispatcher could drive `claude` sessions through this instead of
a terminal multiplexer such as tmux, at the cost of the single view across `codex`/`pi`/others that
such a host gives.
