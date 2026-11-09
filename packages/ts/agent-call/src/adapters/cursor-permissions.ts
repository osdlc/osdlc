import { note, type CapabilityNote, type Support } from '../plan.js'

/** The rule kinds cursor's `permissions.allow` / `permissions.deny` accept. */
const CURSOR_RULE = /^(Shell|Read|Write|WebFetch|Mcp)\(.+\)$/

const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead'])
const WRITE_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

/** One agent-call tool entry translated to a cursor rule, or dropped. */
export interface CursorRuleMapping {
  rule?: string | undefined
  support: Support
  detail: string
}

/**
 * Map one `allowTools` / `denyTools` entry (claude-style names, the README's
 * reference vocabulary) to a cursor permission rule.
 *
 * - `Read(p)`, `Write(p)` and entries already in cursor's `Kind(arg)` form are
 *   `native`. Bare `Read` and `Write` mean `(**)`.
 * - `Grep`/`Glob`/`LS` -> `Read(**)`, `Edit`/`MultiEdit`/`NotebookEdit` ->
 *   `Write(**)`, `Edit(p)` -> `Write(p)`: `approximated`, as cursor has one
 *   read kind and one write kind.
 * - `Bash` -> `Shell(*)`. `Bash(git push:*)` / `Bash(git *)` -> `Shell(git)`,
 *   the command's first word, `approximated`. For an allow entry with
 *   arguments that would widen the grant, so it is dropped; a deny entry
 *   keeps the wider rule, which only blocks more.
 * - `mcp__server__tool` -> `Mcp(server:tool)`, `mcp__server` -> `Mcp(server:*)`.
 * - `WebFetch` -> `WebFetch(*)`, `WebFetch(domain:x)` -> `WebFetch(x)`.
 * - Anything else is dropped, never passed through.
 */
export function mapCursorTool(entry: string, kind: 'allow' | 'deny'): CursorRuleMapping {
  const name = entry.trim()
  if (CURSOR_RULE.test(name) && !name.startsWith('WebFetch(domain:')) {
    return { rule: name, support: 'native', detail: `${name} (cursor rule, passed verbatim)` }
  }
  const call = /^([A-Za-z_][\w-]*)(?:\((.*)\))?$/.exec(name)
  if (call === null) return dropped(name)
  const tool = call[1]!
  const arg = call[2]?.trim()
  const hasArg = arg !== undefined && arg !== ''

  if (tool === 'Read' || tool === 'Write') {
    const rule = `${tool}(${hasArg ? arg : '**'})`
    return { rule, support: 'native', detail: rule }
  }
  if (READ_TOOLS.has(tool)) {
    return hasArg
      ? dropped(name, `${tool} takes no path pattern in cursor`)
      : approx(`Read(**)`, `${tool} -> Read(**)`)
  }
  if (WRITE_TOOLS.has(tool)) {
    const rule = `Write(${hasArg ? arg : '**'})`
    return approx(rule, `${tool} -> ${rule}`)
  }
  if (tool === 'Bash') {
    if (!hasArg || arg === '*') return approx('Shell(*)', 'Bash -> Shell(*)')
    const command = arg.replace(/(:\*|\s*\*)$/, '').trim()
    const first = command.split(/\s+/)[0]!
    if (first === '' || first.includes('*')) return dropped(name, 'cannot derive a command name')
    if (kind === 'allow' && command !== first) {
      return dropped(
        name,
        `cursor matches the command name only; Shell(${first}) would allow more than ${name}`,
      )
    }
    const rule = `Shell(${first})`
    return approx(rule, `${name} -> ${rule} (command name only)`)
  }
  if (tool === 'WebFetch') {
    const domain = hasArg ? arg.replace(/^domain:/, '') : '*'
    const rule = `WebFetch(${domain})`
    return approx(rule, `${name} -> ${rule}`)
  }
  if (tool.startsWith('mcp__')) {
    const [server, ...rest] = tool.slice('mcp__'.length).split('__')
    if (server === undefined || server === '') return dropped(name)
    const rule = `Mcp(${server}:${rest.length > 0 ? rest.join('__') : '*'})`
    return approx(rule, `${name} -> ${rule}`)
  }
  return dropped(name)
}

function approx(rule: string, detail: string): CursorRuleMapping {
  return { rule, support: 'approximated', detail }
}

function dropped(name: string, why = 'no cursor permission rule for this tool'): CursorRuleMapping {
  return { support: 'dropped', detail: `${JSON.stringify(name)} dropped: ${why}` }
}

/**
 * Translate both lists, appending one note per entry. Returns the
 * `permissions` object to write to `.cursor/cli.json`, or undefined when no
 * entry mapped.
 */
export function cursorPermissions(
  notes: CapabilityNote[],
  allowTools: readonly string[] | undefined,
  denyTools: readonly string[] | undefined,
): { allow: string[]; deny: string[] } | undefined {
  const out = { allow: [] as string[], deny: [] as string[] }
  const lists = [
    ['allow', 'permissions.allowTools', allowTools ?? []],
    ['deny', 'permissions.denyTools', denyTools ?? []],
  ] as const
  for (const [kind, field, entries] of lists) {
    for (const entry of entries) {
      const m = mapCursorTool(entry, kind)
      if (m.rule !== undefined && !out[kind].includes(m.rule)) out[kind].push(m.rule)
      note(notes, field, m.support, `.cursor/cli.json permissions.${kind}: ${m.detail}`)
    }
  }
  return out.allow.length + out.deny.length === 0 ? undefined : out
}
