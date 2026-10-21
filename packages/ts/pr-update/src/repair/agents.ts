/**
 * The built-in repair agents: `claude`, `codex`, `cursor` and `pi`.
 *
 * Each is one `@osdlc/agent-call` call run in the update worktree. agent-call
 * owns every CLI's argument list, permission flags, timeout and result parsing;
 * nothing here knows an agent's argv. A preset only says what the call is for:
 * the shared prompt, a posture that lets the agent edit files and never asks,
 * and the repair timeout.
 *
 * The posture is `edits`: file edits allowed, no shell commands, no prompts.
 * That is all a repair needs, and the executor (`../update/execute.ts`) checks
 * the contract afterwards (no commit, no new ref, no conflict markers), so the
 * agent's own sandbox is a second line of defence rather than the only one.
 */

import {
  callAgent,
  claudeAdapter,
  codexAdapter,
  cursorAdapter,
  piAdapter,
  planCall,
  type AgentAdapter,
  type AgentCallSpec,
  type AgentResult,
  type PlannedCall,
} from '@osdlc/agent-call'

import type { Repair, RepairRequest } from '../ports.ts'
import type { RepairAgent } from './names.ts'
import { repairPrompt } from './prompt.ts'

export { REPAIR_AGENTS, REPAIR_AGENT_SUMMARIES, type RepairAgent } from './names.ts'

/** What a preset takes beyond the request. */
export interface AgentRepairOptions {
  /** The agent's own model name; unset means the CLI's default. */
  model?: string | null | undefined
  /** Kill the agent after this long; null or unset means no limit. */
  timeoutSeconds?: number | null | undefined
}

/** Runs one agent call; tests substitute a fake so no real agent ever starts. */
export type CallAgent = (adapter: AgentAdapter, spec: AgentCallSpec) => Promise<AgentResult>

const ADAPTERS: Record<RepairAgent, () => AgentAdapter> = {
  claude: () => claudeAdapter(),
  codex: () => codexAdapter(),
  // Cursor refuses a headless run in a workspace it has not been told to trust.
  // The worktree is ours and ephemeral, and choosing this agent is the consent.
  cursor: () => cursorAdapter({ trustWorkspace: true }),
  pi: () => piAdapter(),
}

/** The agent-call spec for one repair: shared prompt, edit-only posture, worktree, timeout. */
export function repairCallSpec(req: RepairRequest, opts: AgentRepairOptions = {}): AgentCallSpec {
  return {
    prompt: repairPrompt(req),
    permissions: { mode: 'edits' },
    cwd: req.worktree,
    // A repair is one-off; leave no session log behind where the CLI allows it.
    session: { persist: false },
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.timeoutSeconds ? { timeoutMs: opts.timeoutSeconds * 1000 } : {}),
  }
}

/** The call a preset would make, planned and not run: its command line and what was approximated. */
export function planRepair(
  agent: RepairAgent,
  req: RepairRequest,
  opts: AgentRepairOptions = {},
): PlannedCall {
  return planCall(ADAPTERS[agent](), repairCallSpec(req, opts))
}

/** The last non-empty line of `text`, cut to a note's size. */
function lastLine(text: string): string {
  const line = text.trim().split('\n').at(-1) ?? ''
  return line.length > 300 ? `${line.slice(0, 299)}…` : line
}

/**
 * A `Repair` that runs `agent` on the request. Exit status gives `ok`; the
 * agent's final text gives the note (or why it failed, when it said nothing).
 */
export function agentRepair(
  agent: RepairAgent,
  opts: AgentRepairOptions = {},
  call: CallAgent = callAgent,
): Repair {
  return async (req) => {
    let result: AgentResult
    try {
      result = await call(ADAPTERS[agent](), repairCallSpec(req, opts))
    } catch (e) {
      // agent-call rejects only for a call it could not plan.
      return { ok: false, note: `${agent}: ${e instanceof Error ? e.message : String(e)}` }
    }
    const said = lastLine(result.text)
    if (result.ok) return { ok: true, note: said }
    const why = result.error === undefined ? '' : `${result.error.reason}: ${result.error.detail}`
    return { ok: false, note: said === '' ? lastLine(`${agent} ${why}`) : said }
  }
}
