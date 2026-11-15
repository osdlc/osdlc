---
title: 'Codex: harness notes for a dispatcher'
description: How Codex CLI 0.155.1 opens, resumes, forks, queues to and runs sessions headlessly, read from its help text.
retrieved: 2026-09-25
---

# Codex: harness notes for a dispatcher

Source: `codex --help` and subcommand help, codex-cli 0.155.1, examined 2026-09-25. The installed
binary is a compiled Mach-O executable (Homebrew cask) with no
bundled source, so everything here is read from its help text, not from source. Facts are marked
**verified** (present in the help text as described) or **inferred** (a reasonable reading of the
help text and naming, not confirmed).

## Open with a known id and name

- **Verified.** No flag sets a session id or name at open. `codex [PROMPT]` assigns a session id
  automatically; `codex resume`/`fork`/`archive`/`delete` all accept "Session id (UUID) or session
  name," which implies a name can attach to a session at some point, but no top-level open flag
  sets one.
- **Verified.** Sessions live behind what `codex agents`' own summary calls "the shared local
  app-server daemon," reachable over `--remote <ADDR>` (`ws://`, `wss://`, or `unix://`). `resume`,
  `queue`, and `agents` all talk to this same daemon.

## Resume by id with a prompt

- **Verified.** `codex resume [SESSION_ID] [PROMPT]` resumes a saved session by UUID or exact name
  and can carry a new prompt; `--last` skips the picker; `--all` disables cwd filtering and shows
  a CWD column.
- **Verified.** `codex fork [SESSION_ID] [PROMPT]` clones a saved session into a new one instead
  of continuing it in place.

## Native send to a live session

- **Verified.** `codex queue --thread <uuid|name> --message <text>` is described as "Queue a
  message for an existing session."
- **Unresolved.** Whether `queue` reaches a session that is currently open in a live TUI, or only
  appends to a saved/idle one, cannot be confirmed without source or a live test — out of scope
  for this docs pass. **Inferred**: the daemon architecture above
  suggests session state lives in the daemon rather than in any one terminal process, which would
  make delivery to a live session plausible, but that is a guess from naming, not a confirmed
  behavior.

## Headless mode

- **Verified.** `codex exec [PROMPT]` runs non-interactively. `--json` streams events as JSONL;
  `-o/--output-last-message <file>` writes the final message; `--output-schema <file>` validates
  the result against a JSON Schema. `codex exec resume` and `codex exec fork` mirror the
  interactive subcommands.

## Open questions

- **Verified: no.** Does `codex agents` have a non-interactive/JSON listing? Its help lists no
  `--json` flag, unlike `codex exec --json`. It is described as "Browse" and takes
  `--no-alt-screen`, both consistent with an interactive TUI browser with no scriptable output
  today.
- Does `codex queue` deliver into a running TUI? Unresolved — see above.
