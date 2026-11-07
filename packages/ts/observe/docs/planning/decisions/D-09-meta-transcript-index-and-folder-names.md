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
  removed. To make a key clearable, the schema declares it nullable, and the
  caller writes `null`. There is no other way to unset a key; that limit is
  accepted.
- The reducer ignores a `meta_updated` that:
  - gives an immutable key that already has a value a different value (reason
    `immutable_meta`). Restating the same value is not a change.
  - leaves a merged meta that fails the reading model's schema (reason
    `invalid_meta`).

  Like `named` and `pr_linked`, it still applies after `ended`, since it
  describes the session rather than its life. For a lock, `null` is a value:
  an immutable key set to `null` stays `null`.
- A lock belongs to the session's log, not to a process. Every writer folds the
  same `events.jsonl`: a later process, a resume, a hook reporter, another
  machine. A process that is a new session writes its own `launched` event in
  its own directory, with its own meta.
- The record gains `meta?: M`, and `projection`, the version of the model that
  projected it (see Consequences).
- `meta` is for the caller's own fields only. The fields observe already
  defines, such as `run`, `subject`, `task` and `parent`, stay where they are,
  and `meta` never shadows them.
- Schema evolution. The event schema parses `meta` as a plain object, and the
  reducer validates it against the reading model's schema. A `launched` event
  whose meta fails a newer schema still yields a record without `meta`, and its
  index is reported as `invalid_meta`. A schema change never makes a session
  vanish. The README advises adding keys as optional.

### Transcript index

- A new closed list, `TRANSCRIPT_COVERAGES = ['complete', 'partial',
  'unavailable']`, with `TranscriptCoverageSchema` and `TranscriptCoverage`.
  The coverages are ordered `unavailable` < `partial` < `complete`.
- observe owns this vocabulary on disk. agent-call D-10 returns the same three
  values from its own identical union, because neither package depends on the
  other. Each package's tests pin the three values in that order, so a change
  to one fails until both change, and the change is breaking in both.
- A new event, `transcript_captured { paths, coverage }`.
  - `paths` are relative to the store and normalized: `/` separators, no empty,
    `.` or `..` segment, no drive letter, no backslash. The same record then
    names the same files wherever the store is checked out.
  - The main log comes first, then related logs (a sub-agent's).
  - `paths` is empty exactly when the coverage is `unavailable`.
- The record gains `transcript?: { at, paths, coverage }`.
  - The latest capture wins, except that one with less coverage than the one
    held, by the order above, is ignored (reason `weaker_transcript`). An equal
    one replaces it. A partial snapshot never displaces a complete one.
  - A `resumed` event lifts that bar, since the resumed run adds to the
    conversation. The first capture after it is accepted whatever its
    coverage, and its coverage is the bar from then on. The record keeps the
    earlier `transcript` until that capture lands.
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
  never change once set. A typed payload with locks in the reducer replaces
  that code, and every reader of a log agrees on the result.
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
- Older readers and writers:
  - An older reader skips the two new event kinds, as it skips any kind it
    does not know.
  - Its `launched` schema is a plain `z.object`, which drops unknown keys. It
    still reads the event and simply has no `meta` or `immutableMeta`. The new
    `IgnoredEventOf` reasons come only from a reducer that knows the new kinds,
    so an older reader never meets them.
  - An older writer that appends to the same log re-projects `record.json`
    without `meta` or `transcript`, stamping the log length it covered. A newer
    reader would then trust that record. To prevent this, the record gains
    `projection`, the version of the model that wrote it, and a reader reduces
    the log again when a record's version is older than its own (or absent).
- A minor release.
