/**
 * The attended repair modes: the agent's interactive CLI, with the person watching.
 *
 * `interactive` runs it in this terminal with stdio inherited. `terminal` opens it in a detached
 * tmux session through `@osdlc/agent-seat`, the one host that holds a launch until the session
 * ends, and waits. Both give the agent `repairPrompt(req)` as its first message, then return
 * to the executor, which checks the result as it does a headless one (see `Repair` in
 * ports.ts and `tryRepair` in update/execute.ts). A person who quits without a fix gets
 * the same `conflict` or `failed` as a headless repair that gave up.
 */

import { harnessArgv, makeTmuxHost, tmuxRunSessionName, type Host } from '@osdlc/agent-seat'
import { forwardedSignal, streamRunner } from '@osdlc/command-seam'

import type { Repair } from '../ports.ts'
import { SCRUBBED_ENV, repairBinary, type AgentRepairOptions } from './agents.ts'
import type { RepairAgent, RepairMode } from './names.ts'
import { repairPrompt } from './prompt.ts'

/** Runs `binary` with `argv` and inherited stdio; tests substitute a fake. */
export type RunInherited = (
  binary: string,
  argv: string[],
  opts: { cwd: string; timeoutMs?: number },
) => number

const runInherited: RunInherited = (binary, argv, opts) =>
  streamRunner(binary).run(argv, { ...opts, env: SCRUBBED_ENV }).exitCode

/** What the attended modes reach outside the process; tests replace them. */
export interface SeatDeps {
  run?: RunInherited
  /** The host `terminal` mode opens its session on. */
  host?: Host
  /** One line to the person: where to attach. */
  notice?: (line: string) => void
}

/** A `Repair` that puts `agent` in front of the person, in `mode`. */
export function seatRepair(
  agent: RepairAgent,
  mode: Exclude<RepairMode, 'headless'>,
  opts: AgentRepairOptions = {},
  deps: SeatDeps = {},
): Repair {
  const binary = repairBinary(agent)
  const timeoutMs = opts.timeoutSeconds ? opts.timeoutSeconds * 1000 : undefined
  return async (req) => {
    if (forwardedSignal() !== undefined) return { ok: false, note: `${agent}: interrupted` }
    const prompt = repairPrompt(req)
    const model = opts.model ? { model: opts.model } : {}
    let exitCode: number
    try {
      if (mode === 'interactive') {
        const argv = harnessArgv(agent, binary, prompt, {}, model)
        exitCode = (deps.run ?? runInherited)(binary, argv.slice(1), {
          cwd: req.worktree,
          ...(timeoutMs === undefined ? {} : { timeoutMs }),
        })
      } else {
        const host = deps.host ?? makeTmuxHost({})
        if (!host.available() || host.session === undefined) {
          return { ok: false, note: `${agent}: repair.mode terminal needs tmux on PATH` }
        }
        const runId = `pr-update-${req.pr}-${process.pid}`
        deps.notice?.(
          `repair #${req.pr}: attach with \`tmux attach -t ${tmuxRunSessionName(runId)}\``,
        )
        exitCode = host.session({
          cwd: req.worktree,
          harness: agent,
          binary,
          prompt,
          title: `pr-update #${req.pr}`,
          env: SCRUBBED_ENV,
          ...(opts.model ? { model: opts.model } : {}),
          focus: false,
          wait: { runId, ...(timeoutMs === undefined ? {} : { timeoutMs }) },
        }).exitCode
      }
    } catch (e) {
      return { ok: false, note: `${agent}: ${e instanceof Error ? e.message : String(e)}` }
    }
    if (forwardedSignal() !== undefined) return { ok: false, note: `${agent}: interrupted` }
    return exitCode === 0
      ? { ok: true, note: `${agent}: ${mode} session ended` }
      : { ok: false, note: `${agent}: ${mode} session exited ${exitCode}` }
  }
}
