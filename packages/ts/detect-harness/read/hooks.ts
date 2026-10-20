/**
 * Parse hooks files into report entries.
 *
 * Both `detect()` and the `./model` plugin reader use these. Two layouts:
 *   - nested (Claude Code and Codex): `{ "<Event>": [{ matcher?, hooks: [handler] }] }`;
 *   - flat (Cursor): `{ "<event>": [handler] }`, where a handler may carry its own `matcher`.
 *
 * Codex runs a hook only after the user approves it, and records the approval
 * in `config.toml` under `[hooks.state."<hooks.json>:<event>:<group>:<hook>"]`
 * with the hash of the hook as it was approved. {@link codexHookHash} and the
 * trust rule were checked against Codex 0.162.
 *
 * Runtime-agnostic: `node:crypto` only.
 */

import { createHash } from 'node:crypto'

import { asObject } from '../json.ts'
import type { Scope } from '../locations.ts'
import type { Hook, HookTrust } from '../report.ts'

type Json = Record<string, unknown>

/** Where a hooks map came from. */
export interface HookOrigin {
  scope: Scope
  origin: string
  source: string
}

/** Decides a nested hook's trust from its event, group and handler positions. */
export type TrustOf = (event: string, g: number, h: number, group: Json, hook: Json) => HookTrust

function handler(event: string, matcher: string | null, hook: Json, from: HookOrigin): Hook {
  return {
    event,
    matcher,
    type: typeof hook['type'] === 'string' ? hook['type'] : 'command',
    command: typeof hook['command'] === 'string' ? hook['command'] : null,
    timeout: typeof hook['timeout'] === 'number' ? hook['timeout'] : null,
    ...from,
    trust: null,
  }
}

/** Parse a nested events map. With `trustOf`, each handler carries its trust. */
export function parseNestedHooks(value: unknown, from: HookOrigin, trustOf?: TrustOf): Hook[] {
  const events = asObject(value)
  if (!events) return []
  const out: Hook[] = []
  for (const [event, groups] of Object.entries(events)) {
    if (!Array.isArray(groups)) continue
    groups.forEach((rawGroup, g) => {
      const group = asObject(rawGroup)
      if (!group || !Array.isArray(group['hooks'])) return
      const matcher = typeof group['matcher'] === 'string' ? group['matcher'] : null
      ;(group['hooks'] as unknown[]).forEach((rawHook, h) => {
        const hook = asObject(rawHook)
        if (!hook) return
        const entry = handler(event, matcher, hook, from)
        out.push(trustOf ? { ...entry, trust: trustOf(event, g, h, group, hook) } : entry)
      })
    })
  }
  return out
}

/** Parse a flat events map (Cursor). */
export function parseFlatHooks(value: unknown, from: HookOrigin): Hook[] {
  const events = asObject(value)
  if (!events) return []
  const out: Hook[] = []
  for (const [event, entries] of Object.entries(events)) {
    if (!Array.isArray(entries)) continue
    for (const raw of entries) {
      const hook = asObject(raw)
      if (!hook) continue
      const matcher = typeof hook['matcher'] === 'string' ? hook['matcher'] : null
      out.push(handler(event, matcher, hook, from))
    }
  }
  return out
}

/**
 * The events map of a Claude Code plugin hooks block: a hooks file wraps it in
 * `hooks`, and an inline `plugin.json` block is the map itself.
 */
export function eventsOf(block: Json): unknown {
  return asObject(block['hooks']) ?? block
}

/** `PostToolUse` to `post_tool_use`: the event segment of Codex's trust key. */
export function snakeEvent(event: string): string {
  return event.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

/** `value` as JSON with every object's keys sorted, as `serde_json` writes it after `sort_all_objects`. */
function sortedJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(sortedJson).join(',')}]`
  const obj = asObject(value)
  if (obj) {
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined && obj[k] !== null)
      .sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${sortedJson(obj[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/**
 * The hash Codex records as `trusted_hash` when the user approves a command hook:
 * sha256 of the sorted JSON of `{ event_name, matcher?, hooks: [handler] }`, the
 * handler normalised (`async` defaults to false; `timeout` defaults to 600 s, or
 * for `Interrupt` and `SessionEnd` to 1 s clamped to 1–3 s; unset optional
 * fields omitted).
 */
export function codexHookHash(event: string, group: Json, hook: Json): string {
  const short = event === 'Interrupt' || event === 'SessionEnd'
  const given = typeof hook['timeout'] === 'number' ? hook['timeout'] : undefined
  const timeout = short ? Math.min(Math.max(given ?? 1, 1), 3) : Math.max(given ?? 600, 1)
  const handlerJson: Json = {
    type: 'command',
    command: hook['command'],
    commandWindows: hook['commandWindows'] ?? hook['command_windows'],
    timeout,
    async: hook['async'] === true,
    statusMessage: hook['statusMessage'],
    additionalContextLimit: hook['additionalContextLimit'],
  }
  const identity = {
    event_name: snakeEvent(event),
    matcher: typeof group['matcher'] === 'string' ? group['matcher'] : undefined,
    hooks: [handlerJson],
  }
  return `sha256:${createHash('sha256').update(sortedJson(identity)).digest('hex')}`
}

/** The `[hooks.state]` table of a parsed Codex `config.toml`. */
export function codexHookState(config: Json | null): Json {
  const hooks = asObject(config?.['hooks'])
  return asObject(hooks?.['state']) ?? {}
}

/**
 * Codex's trust for a hook recorded under any of `keys`: `trusted` when a
 * recorded hash is the hook's current hash (and not disabled), `modified` when
 * it was approved but has changed since, `untrusted` when it was never approved
 * or the user disabled it.
 */
export function codexTrust(state: Json, keys: readonly string[], hash: string): HookTrust {
  const recorded = keys
    .map((key) => asObject(state[key]))
    .filter((e): e is Json => e !== null && e['enabled'] !== false)
    .filter((e) => typeof e['trusted_hash'] === 'string' && e['trusted_hash'] !== '')
  if (recorded.some((e) => e['trusted_hash'] === hash)) return 'trusted'
  return recorded.length > 0 ? 'modified' : 'untrusted'
}
