/**
 * The headless agents `repair.agent` and `--repair-agent` choose from, and the
 * one line each gets in `update --help`.
 *
 * Kept free of imports so the config schema can name the choices without
 * loading the agent runner.
 */

export const REPAIR_AGENTS = ['claude', 'codex', 'cursor', 'pi'] as const

export type RepairAgent = (typeof REPAIR_AGENTS)[number]

/** One line per agent: what it is and the binary it runs. */
export const REPAIR_AGENT_SUMMARIES: Record<RepairAgent, string> = {
  claude: 'Claude Code (the `claude` CLI)',
  codex: 'OpenAI Codex (the `codex` CLI, `codex exec`)',
  cursor: 'Cursor (the `agent` CLI)',
  pi: 'the pi coding agent (the `pi` CLI)',
}
