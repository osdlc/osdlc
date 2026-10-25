/**
 * `way run <id> [-- args]`: run one task by id, with the argument rules the
 * terminal UI and the web view use.
 */

import { CommandError, UsageError, outcome } from '@osdlc/cli-tool/command'
import { commandString } from '@osdlc/command-seam'
import type { Catalog } from '@osdlc/system-model/detect'

import { handOff } from '../core/run.ts'
import { SessionError, type RunPlan } from '../core/session.ts'
import { RunOutput, type RunDocumentBody } from '../documents.ts'
import { terminalSafe } from '../terminal-text.ts'
import { copyText } from '../tui/copy.ts'
import { parametersUnknownLabel } from '../vocabulary.ts'
import { kit, openSession } from './shared.ts'

function runDocument(
  plan: RunPlan,
  ran: boolean,
  exit: number | null,
  unknowns: RunDocumentBody['unknowns'],
): RunDocumentBody {
  return {
    task: plan.task.id,
    display: plan.task.display,
    argv: plan.argv,
    command: commandString(plan.argv, plan.task.cwd === '.' ? {} : { cwd: plan.task.cwd }),
    cwd: plan.cwd,
    env: plan.env,
    ran,
    exit,
    unknowns,
  }
}

/**
 * The id `word` names. A line `list` prints (the copied form, with its `cd`
 * and quoting) names the one task it is the line of; anything else is passed
 * on as it is.
 */
function taskIdFor(catalog: Catalog, word: string): string {
  const tasks = catalog.reports.flatMap((r) => r.tasks)
  if (tasks.some((t) => t.id === word)) return word
  const byLine = tasks.filter((t) => copyText(t) === word)
  return byLine.length === 1 ? byLine[0]!.id : word
}

/** Make the `run` command. */
export function runCommand(home: string) {
  return kit.command({
    summary: 'run one task by id; arguments after --',
    description:
      'Finds the task by its id ("list --json" shows ids), or by a command line only one task ' +
      'has, as "list" prints it, and runs it in this ' +
      'terminal with the arguments after --, bound the way its tool expects (npm run x -- a, ' +
      'just x a). The same rules as Enter in the terminal UI and Run in the web view. Exits ' +
      "with the task's exit code. --dry-run prints what would run instead; with --json it is " +
      'the run document. A task that uses an editor variable is not run, and neither is an ' +
      'agent skill: type its /<name> in the agent.',
    positionals: [
      {
        name: 'id',
        required: true,
        help: 'the task id, as "list --json" shows it, or its line from "list"',
      },
    ],
    rest: { name: 'args' },
    flags: {
      cached: { kind: 'boolean', help: 'find the task in the last stored probe, not a new one' },
      dryRun: { kind: 'boolean', help: 'print what would run, and run nothing' },
    },
    output: RunOutput,
    kind: 'run',
    examples: [
      'run just:justfile:build',
      'run npm:package.json:test -- --watch',
      'run x --dry-run --json',
    ],
    // Running a task is the command line's; an adapter may only ask what would run.
    exposureOf: (input) => (input.flags.dryRun === true ? 'all' : 'cli-only'),
    async run({ flags, globals, positionals, rest }, ctx) {
      if (ctx.json && !flags.dryRun) {
        throw new UsageError('--json needs --dry-run: a running task writes to stdout itself')
      }
      const session = await openSession(globals, ctx, home)
      const snapshot = await session.catalog({ cached: flags.cached })
      let plan: RunPlan
      try {
        plan = session.resolveRun(
          snapshot.catalog,
          taskIdFor(snapshot.catalog, positionals[0]!),
          rest,
        )
      } catch (err) {
        const skill = snapshot.skills.find(
          (s) => s.id === positionals[0] || s.invoke === positionals[0],
        )
        if (err instanceof SessionError && err.code === 'task-not-found' && skill !== undefined) {
          throw new CommandError(`${skill.invoke}: a skill runs in an agent, not here`, {
            code: 'not-runnable',
            hint: `type ${skill.invoke} in ${skill.harnesses.join(', ')}`,
          })
        }
        if (err instanceof SessionError) {
          throw new CommandError(err.message, {
            code: err.code,
            ...(err.code === 'bad-arguments' ? { exit: 2 } : {}),
            ...(err.hint !== undefined ? { hint: err.hint } : {}),
          })
        }
        throw err
      }
      const unknowns = session
        .unknowns(snapshot)
        .filter((u) => u.runner === plan.task.runner && u.kind !== 'stale')
      const reason = plan.task.parametersUnknown
      if (reason !== undefined && rest.length === 0) {
        ctx.note(`${terminalSafe(plan.task.display)}: ${parametersUnknownLabel(reason)}`)
      }
      if (flags.dryRun) return runDocument(plan, false, null, unknowns)

      // What actually runs, not `display`: for a task with parameters they differ.
      ctx.io.stderr(`$ ${terminalSafe(commandString(plan.argv))}\n`)
      const ended = handOff(plan)
      if (ended.error !== undefined) {
        throw new CommandError(`${plan.argv[0]}: ${ended.error}`, {
          code: 'spawn',
          ...(snapshot.origin === 'probe'
            ? {}
            : {
                hint: 'the task came from a stored probe and may no longer exist; run without --cached',
              }),
        })
      }
      return outcome(runDocument(plan, true, ended.exit, unknowns), ended.exit)
    },
    text(doc) {
      // After a real run the task has printed its own output.
      return doc.ran ? '' : `${terminalSafe(doc.command)}\n`
    },
  })
}
