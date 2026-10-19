---
id: D-09
type: decision
state: proposed
created: 2026-10-19
---

# D-09: Session meta, a transcript index and safe folder names

## Decision

### Meta payload

- `SessionVocabulary` gains two optional fields. `meta` is a zod schema for the
  caller's own payload, an object. `immutableMeta` lists that payload's keys that
  must keep their first value, and it is typed against the schema's keys. A
  fourth generic parameter `M` has a default (`Record<string, unknown>`), so a
  model defined today compiles unchanged.

  ```ts
  const model = defineSessionModel({
    harness: z.enum(['aider', 'goose']),
    host: z.enum(['terminal', 'tmux']),
    launchFlags: z.object({}),
    meta: z.object({
      role: z.enum(['lead', 'helper']),
      attempt: z.number().int(),
      label: z.string().optional(),
    }),
    immutableMeta: ['role', 'attempt'],
  })
  ```

- The `launched` event may carry `meta`. The model stamps the vocabulary's
  `immutableMeta` list onto the `launched` event it appends, so the list is in
  the log, and a reader with another vocabulary (`looseSessionModel`) enforces
  the same locks.
- A new event, `meta_updated { meta }`, merges its keys over the record's
  meta. The merge is shallow: each key's value is replaced whole, and no key is
  removed.
- The reducer ignores a `meta_updated` that:
  - gives an immutable key that already has a value a different value (reason
    `immutable_meta`). Restating the same value is not a change.
  - leaves a merged meta that fails the reading model's schema (reason
    `invalid_meta`).
  
  Like `named` and `pr_linked`, it still applies after `ended`, since it
  describes the session rather than its life.
- A lock belongs to the session's log, not to a process. Every writer folds the
  same `events.jsonl`: a later process, a resume, a hook reporter, another
  machine. A process that is a new session writes its own `launched` event in
  its own directory, with its own meta.
- The record gains `meta?: M`.
- Schema evolution. The event schema parses `meta` as a plain object, and the
  reducer validates it against the reading model's schema. A `launched` event
  whose meta fails a newer schema still yields a record without `meta`, and its
  index is reported as `invalid_meta`. A schema change never makes a session
  vanish. The README advises adding keys as optional.

### Transcript index

- A new closed list, `TRANSCRIPT_COVERAGES = ['complete', 'partial',
  'unavailable']`, with `TranscriptCoverageSchema` and `TranscriptCoverage`.
- A new event, `transcript_captured { paths, coverage }`.
  - `paths` are relative to the store and normalized: `/` separators, no empty,
    `.` or `..` segment, no drive letter, no backslash. The same record then
    names the same files wherever the store is checked out.
  - The main log comes first, then related logs (a sub-agent's).
  - `paths` is empty exactly when the coverage is `unavailable`.
- The record gains `transcript?: { at, paths, coverage }`.
  - The latest capture wins, except that one with less coverage than the one
    held is ignored (reason `weaker_transcript`), so a partial snapshot never
    displaces a complete one.
  - A `resumed` event lifts that bar, since the resumed run adds to the
    conversation.
- `transcriptPath`, the harness's own log path as a hook reports it, is
  unchanged.
- observe still never reads a transcript. It records where a caller copied
  snapshots and how much they cover.

### Mapping a caller's own statuses

There is no change to the closed lists. The README gets a section on mapping:

- A session that was interrupted or vanished ends with outcome `lost`. One that
  was stopped on purpose ends with `cancelled`.
- A retry or replacement is a new session. Its `parent.session` is the session
  it replaces, and its `origin` is whatever started it. Attempt numbers and roles
  go in `meta`, with identity keys in `immutableMeta`.

### Safe folder names

- `sessionDirectoryName(parts, label?)` sits next to `sessionEventsPath`. It
  returns 24 hex characters of SHA-256 over `JSON.stringify(parts)`.
- With a label, the label comes first: lowercased, each run of characters other
  than `a-z` and `0-9` turned into one `-`, and cut to 40 characters.
- It throws a `RangeError` when `parts` is empty.
- The same parts give the same name, and an opaque id never becomes a path.

## Why

- A launcher often keeps its own fields on a session, and some of them must
  never change once set. A typed payload
  with locks in the reducer replaces that code, and every reader of a log agrees
  on the result.
- One absolute `transcriptPath` cannot describe a conversation spread over
  several logs, or a store that moves between machines. It also cannot say
  whether a snapshot is whole.
- Interrupted and retried work maps onto the existing outcomes and lineage, so
  the closed lists stay closed. A documented convention is enough.
- Every consumer hashing ids into folder names writes the same few lines.

## Consequences

- The new exports are `sessionDirectoryName`, `TRANSCRIPT_COVERAGES`,
  `TranscriptCoverageSchema`, `TranscriptCoverage`, `SessionTranscriptSchema` and
  `SessionTranscript`. They are stable for 0.x.
- `TranscriptCoverage` joins the closed unions of D-04.
- `IgnoredEventOf['reason']` gains `immutable_meta`, `invalid_meta` and
  `weaker_transcript`. D-04 does not list it as closed, but the changeset says
  so.
- An older reader skips the two new event kinds, as it skips any kind it does
  not know.
- A minor release.
