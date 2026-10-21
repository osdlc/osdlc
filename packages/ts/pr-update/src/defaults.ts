/**
 * The `Ports` a standalone `pr-update` run supplies for itself, with no host
 * (a repository registry, a trust store, an agent runner) in front of it.
 *
 * A library consumer builds its own `Ports` instead: it binds `locate` to its
 * registry, `runVerb` to its shell seam, `resolveVerifyVerbs` to its own
 * trust-gated command lists and `repair` to its own agent runner, none of
 * which this package depends on.
 */

import { runShell, runShellAsync, stderrOrError } from '@osdlc/command-seam'

import type { PrUpdateStandaloneConfig } from './config.ts'
import type { Ports, Repair } from './ports.ts'
import { agentRepair } from './repair/agents.ts'
import { attemptsDir, fileAttemptStore } from './update/attempts.ts'

/**
 * A `Repair` that runs `command` with `sh -c` in the update worktree, killed
 * after `timeoutSeconds` when given (a killed command is not exit 0, so it
 * reads as giving up). The request arrives as JSON on stdin and as
 * `PR_UPDATE_*` variables; exit 0 claims success, and the note is the
 * command's last line of output.
 */
export function commandRepair(command: string, timeoutSeconds: number | null = null): Repair {
  return async (req) => {
    const res = await runShellAsync(command, {
      ...(timeoutSeconds === null ? {} : { timeoutMs: timeoutSeconds * 1000 }),
      cwd: req.worktree,
      input: JSON.stringify(req),
      env: {
        PR_UPDATE_KIND: req.kind,
        PR_UPDATE_PR: String(req.pr),
        PR_UPDATE_BASE: req.base,
        PR_UPDATE_HEAD: req.head,
        PR_UPDATE_WORKTREE: req.worktree,
        PR_UPDATE_PATHS: req.paths.join('\n'),
        PR_UPDATE_REASON: req.reason,
      },
    })
    const out = (res.stdout.trim() || stderrOrError(res)).split('\n')
    return { ok: res.exitCode === 0, note: out[out.length - 1] ?? '' }
  }
}

/**
 * A standalone run has no repository registry to scan, so `--repo` naming
 * anything other than the local checkout always comes back unmeasurable —
 * honest, since there is nothing here to guess a path from.
 *
 * With `projectRoot`, failed updates are recorded in
 * `<projectRoot>/.pr-update/attempts/`.
 */
export function standalonePorts(cfg?: PrUpdateStandaloneConfig, projectRoot?: string): Ports {
  const command = cfg?.repair.command ?? null
  const agent = cfg?.repair.agent ?? null
  const timeout = cfg?.repair.timeout_seconds ?? null
  const testCommand = cfg?.test_command ?? null
  return {
    locate: () => null,
    runVerb: (verb, cwd) => runShell(verb, { cwd }),
    // A standalone run has no host registry to resolve `check` from, and runs
    // `test` only from `test_command`. Failing loudly beats running zero verbs
    // and reporting a push as verified when it was not checked at all.
    async resolveVerifyVerbs({ which }) {
      if (which === 'check') {
        throw new Error(
          'verify: check has no meaning in a standalone run — embed @osdlc/pr-update as a ' +
            "library and supply Ports.resolveVerifyVerbs, or set verify: 'none'",
        )
      }
      if (testCommand === null) {
        throw new Error(
          "verify: test needs test_command in a standalone run — set pr_update.test_command in the project config, or set verify: 'none'",
        )
      }
      return [testCommand]
    },
    ...(agent !== null
      ? {
          repair: agentRepair(agent, {
            model: cfg?.repair.model ?? null,
            timeoutSeconds: timeout,
          }),
        }
      : command !== null
        ? { repair: commandRepair(command, timeout) }
        : {}),
    ...(projectRoot === undefined ? {} : { attempts: fileAttemptStore(attemptsDir(projectRoot)) }),
  }
}
