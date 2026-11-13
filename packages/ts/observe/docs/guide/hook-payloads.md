---
title: Reading hook payloads
sidebar:
  order: 2
description: One envelope for the JSON a coding-agent harness sends to a hook, with examples per harness.
---

Coding-agent harnesses such as Claude Code and Codex can run a command of yours
at points in a session: before a tool runs, after it runs, when the person
submits a prompt, when the agent stops. That command is a hook. The harness
writes a JSON payload to the hook's standard input describing what happened.

Every hook has to answer the same first questions before it does anything
useful. Which harness called me? Which event is this? Which session, in which
directory, and where is its transcript? Each harness spells the answers a little
differently, and some leave fields out. `@osdlc/observe/hook` answers them once,
the same way for every harness, and never throws while doing it.

The entry is experimental. See [Stability](#stability).

## The problem, in two payloads

Claude Code sends this to a `PreToolUse` hook:

```json
{
  "session_id": "4b9c7e2a-61f0-4d3b-9a85-0f2e6c1d7b34",
  "transcript_path": "/home/ada/.claude/projects/-work-app/4b9c7e2a.jsonl",
  "cwd": "/work/app",
  "hook_event_name": "PreToolUse",
  "prompt_id": "p-12",
  "tool_name": "Bash",
  "tool_input": { "command": "npm test" }
}
```

Codex sends nearly the same shape, but its per-prompt id is `turn_id`, and
under `--ephemeral` it sends `transcript_path: null`. Cursor uses different names altogether:
`conversation_id` for the session, `workspace_roots` for the directory,
`generation_id` for the prompt, and `beforeSubmitPrompt` where the others say
`UserPromptSubmit`. A hook script written against one harness silently reads
`undefined` on another.

## The envelope

```ts
import { normalizeHookText } from '@osdlc/observe/hook'
import { readFileSync } from 'node:fs'

const envelope = normalizeHookText('claude', readFileSync(0, 'utf-8'))
```

For the Claude Code payload above, `envelope` is:

```ts
{
  harness: 'claude',
  event: 'PreToolUse',
  sessionId: '4b9c7e2a-61f0-4d3b-9a85-0f2e6c1d7b34',
  cwd: '/work/app',
  transcriptPath: '/home/ada/.claude/projects/-work-app/4b9c7e2a.jsonl',
  promptId: 'p-12',
  raw: { /* the payload exactly as sent */ },
  missing: [],
}
```

- `harness` is what you passed in. The hook knows which harness it was
  installed for; the payload does not always say.
- `event` is the harness's own event name. It is `'unknown'` when the payload
  has none.
- `sessionId`, `cwd` and `transcriptPath` are `null` when the payload lacks
  them, and `missing` lists which ones. An empty string counts as missing.
- `promptId` is read from `turn_id` for Codex and `prompt_id` for the others,
  and is left out when there is none.
- `raw` is the whole payload, untouched.

### When the payload is broken

A hook runs inside the agent's turn. If it crashes on a payload it does not
understand, the person's session suffers. So nothing here throws:

```ts
normalizeHookText('codex', 'not json')
// {
//   harness: 'codex', event: 'unknown',
//   sessionId: null, cwd: null, transcriptPath: null,
//   raw: null,
//   missing: ['event', 'session_id', 'cwd', 'transcript_path'],
// }
```

An event this package has never heard of, from a newer harness version, still
gives an envelope with its name in `event`.

## Reading the rest of the payload

Only the envelope is translated. Everything specific to an event, such as
`tool_name`, `tool_input` or the prompt text, stays in `raw` as the harness
sent it. Read it with the typed readers, which return `undefined` instead of the
wrong type:

```ts
import { rawNumber, rawString, rawValue } from '@osdlc/observe/hook'

const tool = rawString(envelope, 'tool_name') // 'Bash'
const input = rawValue(envelope, 'tool_input') // { command: 'npm test' }
const ms = rawNumber(envelope, 'duration_ms') // undefined: not in this payload
```

They read only the payload's own fields: `rawValue(envelope, 'constructor')` is
`undefined`, not `Object`.

One event body has a helper. A `Notification` whose `notification_type` is a
permission prompt or an elicitation dialog means the agent is waiting for a
person:

```ts
import { isPermissionNotification } from '@osdlc/observe/hook'

if (envelope.event === 'Notification') {
  const waiting = isPermissionNotification(rawString(envelope, 'notification_type'))
}
```

Why not translate the bodies too? A translation is only safe when every
harness's field has a documented source. For most events those sources do not
exist yet, and a guessed mapping would be silently wrong. So the body is passed
through, and you see exactly what the harness sent.

## Harnesses

| Harness id | Payload arrives as | Before calling `normalizeHook` |
|---|---|---|
| `claude` | Claude Code's hook payload | nothing |
| `codex` | Codex's hook payload (`turn_id` is the prompt id) | nothing |
| `cursor` | Cursor's own names | re-key it (below) |
| `pi` | no hooks of its own | forward events from a pi extension in Claude Code's names |
| `opencode` | no hooks of its own | forward events from an opencode plugin in Claude Code's names |

The ids are the ones `@osdlc/detect-harness` uses, so a hook event can be joined
to that package's report of what is installed.

A Cursor payload needs its keys renamed first. A minimal re-keying:

```ts
const cursorEvents: Record<string, string> = {
  sessionStart: 'SessionStart',
  sessionEnd: 'SessionEnd',
  beforeSubmitPrompt: 'UserPromptSubmit',
  postToolUse: 'PostToolUse',
  stop: 'Stop',
}

function fromCursor(raw: Record<string, unknown>): Record<string, unknown> {
  const event = raw['hook_event_name'] as string | undefined
  const roots = Array.isArray(raw['workspace_roots']) ? raw['workspace_roots'] : []
  return {
    ...raw,
    hook_event_name: event === undefined ? undefined : (cursorEvents[event] ?? event),
    session_id: raw['conversation_id'] ?? raw['session_id'],
    cwd: raw['cwd'] ?? roots[0],
    prompt_id: raw['generation_id'],
  }
}

const envelope = normalizeHook('cursor', fromCursor(JSON.parse(stdin)))
```

## Before you log it

`raw` holds whatever the harness sent, which can include prompt text and tool
output. Redact it before it goes on disk. See
[Keeping secrets out of logs](./redaction.md).

## Stability

The entry is experimental: it may change in a minor release. Two things are
still open:

- **Which event bodies get translated.** Today none are. The likely next step
  is a short list of common events (`Stop`, `UserPromptSubmit`, and
  `PreToolUse`/`PostToolUse` for shell and file tools), each only once every
  harness's fields are sourced.
- **New harnesses.** `HookHarness` is a closed list, so adding an id is a
  breaking change while the package is 0.x.

The envelope itself is the part every option keeps. The reasoning is in
[D-10](../planning/decisions/D-10-hook-envelope.md).

## Reference

| Export | What it is |
|---|---|
| `normalizeHook(harness, payload)` | The envelope of a parsed payload. Never throws. |
| `normalizeHookText(harness, text)` | Parses stdin text, then `normalizeHook`. Never throws. |
| `HookEnvelope`, `HookEnvelopeSchema` | The envelope type and its zod schema. |
| `HOOK_HARNESSES`, `HookHarness` | The harness ids. |
| `HOOK_ENVELOPE_FIELDS`, `HookEnvelopeField` | The names `missing` can list. |
| `rawString`, `rawNumber`, `rawValue` | Typed reads of the payload's own fields. |
| `isPermissionNotification(type)` | Whether a `Notification` waits on a person. |
