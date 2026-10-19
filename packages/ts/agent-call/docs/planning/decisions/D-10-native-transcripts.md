---
id: D-10
type: decision
state: proposed
created: 2026-10-19
---

# D-10: Reading an agent's own transcript

## Decision

- agent-call can read the conversation log an agent CLI keeps for a session it
  did not start: an interactive session, or one started by another tool. The new
  exports are all experimental:

  ```ts
  type TranscriptCoverage = 'complete' | 'partial' | 'unavailable'
  interface NativeTranscriptOptions {
    cwd?: string // the session's working directory; narrows the search
    running?: boolean // the session may still be writing: coverage is at most 'partial'
    home?: string // default os.homedir()
    env?: Record<string, string | undefined> // default process.env
  }
  interface NativeTranscriptFile {
    path: string
    role: 'main' | 'related'
    lines: string[]
    torn: boolean
  }
  interface NativeTranscript {
    agent: string
    sessionId: string
    format: string
    coverage: TranscriptCoverage
    files: NativeTranscriptFile[]
    notes: string[]
  }
  readNativeTranscript(adapter, sessionId, options?): NativeTranscript
  nativeConversation(adapter, transcript): Conversation | undefined
  ```

- `AgentAdapter` gains two optional methods that back these functions,
  `readNativeTranscript` and `nativeConversation`. An adapter without them
  reports `unavailable` with no files. The first release covers claude and
  codex.
- `lines` holds complete lines only. A cut-off last line sets `torn` and makes
  the coverage `partial`. `running: true` also makes it `partial`. No log found
  makes it `unavailable`. `notes` says why the coverage is below `complete`.
- A related file is a log linked to this session, such as a sub-agent's. Logs of
  other conversations are never returned.
- The package reads and never writes. Copying the logs somewhere, and the rules
  for replacing an earlier copy, are the caller's.

### claude

- The log is `<config>/projects/<cwd>/<id>.jsonl`.
  - `<config>` is `$CLAUDE_CONFIG_DIR`, else `~/.claude`.
  - `<cwd>` is the working directory with each character other than a letter
    or digit turned into `-`.
- When that file is missing, every project directory is searched for
  `<id>.jsonl`. The match is by file name, so a log whose first line does not
  carry the id is still found.
- Related files are `<projectDir>/<id>/subagents/*.jsonl`.
- The conversation reuses the Anthropic content mapping of the stream parser.
  - Lines marked `isMeta` or `isSidechain` are skipped.
  - Each message keeps its line's timestamp.
  - Usage is summed over assistant messages, taking the last usage per message
    id, because a streamed message repeats it.

### codex

- The log is the rollout file `rollout-<timestamp>-<threadId>[_<rolloutId>].jsonl`.
  - It lives under `$CODEX_HOME` (default `~/.codex`), in `sessions/YYYY/MM/DD/`
    or in `archived_sessions/`.
  - When a thread has several rollouts (after a revert), the newest is its
    current history.
- A `.jsonl.zst` copy is decompressed with `zlib.zstdDecompressSync` when the
  runtime has it. When both a plain and a compressed copy exist, the plain one
  wins. When the runtime cannot decompress, coverage drops and a note says so.
- When `session_meta.history_base` says the earlier history is in another
  thread's rollout (a fork), coverage is `partial`, and a note names that
  thread.
- Related files are sub-agent rollouts. Their `session_meta` names this thread
  as `parent_thread_id`, at the top level or under
  `source.subagent.thread_spawn`. Descendants are found the same way. Only the
  first line of each rollout dated on or after the parent's is read to decide.
- The conversation maps the rollout's `response_item` lines:
  - `message` (role `developer` becomes `system`), and `reasoning` summaries
  - `function_call`, `custom_tool_call` and `local_shell_call` as tool calls
  - their `*_output` items as tool results

  Usage comes from the last `token_count` event, and the model from
  `turn_context`.
- No SQLite database is read. codex's SQLite stores hold thread metadata and a
  projection of the rollout. The rollout is the source of truth.

## Why

- Each agent CLI keeps its own log of every session, interactive ones included,
  in its own place and format. Every tool that keeps a record of sessions
  otherwise rewrites the same lookup and parsing.
- The adapters already know each CLI's output format, and their conversation
  mapping is most of what reading the log needs. Keeping both here keeps one
  mapping per agent.
- A closed coverage value lets a caller decide whether a copy is final, without
  knowing each CLI's file layout.

## Consequences

- This widens D-01's scope. A call still holds no session open, but the package
  now also reads an agent's logs after the fact, with no dependencies. These are
  synchronous file reads under the user's home directory.
- The README's Security section says what is read, and that it may include
  anything a person typed into the agent.
- The log layouts belong to the CLIs and change without notice, which is why
  the exports are experimental. Fixtures pin each layout as checked.
- A minor release.
