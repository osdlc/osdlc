---
id: D-10
type: decision
state: proposed
created: 2026-11-07
---

# D-10: The hook envelope

## Decision

- The package ships `@osdlc/observe/hook`: `normalizeHook` and
  `normalizeHookText` read the envelope of a coding-agent harness's hook
  payload (harness, event, session id, cwd, transcript path, prompt id), keep
  the body as sent in `raw`, and list what was missing.
- Only the envelope is normalised. An event's body is not translated between
  harnesses; `rawString`, `rawNumber` and `rawValue` read it.
- The payload must arrive in the shape Claude Code and Codex send. Re-keying a
  harness with another shape, and forwarding events from a harness with no
  hooks, is the caller's job.
- `HookHarness` is a closed union of the ids `@osdlc/detect-harness` uses:
  `claude`, `codex`, `cursor`, `pi` and `opencode`.
- Parsing never throws.
- The entry is experimental until the set of events normalised beyond the
  envelope is decided.

## Rules

These came with the envelope from its first consumer's hook-translation
contract, which is still open on how far event bodies are translated. Every
option it weighs normalises the envelope, so the envelope is safe to publish
first.

- Translate a field only with a source for every harness. Otherwise pass it
  through in `raw` and say so. Never guess.
- A field the payload lacks is `null` and named in `missing`, not filled in.
- An empty string counts as missing.
- The per-prompt id is read from each harness's own key: `turn_id` for Codex,
  `prompt_id` for the others once re-keyed.

## Why

- Every hook needs the envelope, and every harness spells it the same way once
  re-keyed. Translating event bodies needs a source for every harness's fields,
  which does not exist yet for most events, and a guess there is silently
  wrong.
- A hook runs inside the agent's turn. A hook that throws on a field a newer
  harness adds breaks the agent, so a shape the package does not know still
  gives an envelope.
- Sharing the harness ids with `@osdlc/detect-harness` lets a hook event join a
  harness report by id, without a dependency between the two packages.

## Consequences

- A new harness id is a breaking change (a minor version while 0.x), as for the
  other closed unions (D-04).
- Normalising an event body later adds fields and is a feature.
