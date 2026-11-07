/**
 * `way run <id> [-- args]`: run one task by id, with the argument rules the
 * terminal UI and the web view use. With `--agent`, hand an agent skill to
 * an agent's CLI instead.
 */

import { CommandError, UsageError, outcome } from '@osdlc/cli-tool/command'
import { commandString } from '@osdlc/command-seam'

import { BIN } from '../app.ts'
import { handOff } from '../core/run.ts'
import { SessionError, type RunPlan } from '../core/session.ts'
import { HANDOFF_HARNESSES, skillLine } from '../core/skills.ts'
import { RunOutput, type RunDocumentBody } from '../documents.ts'
import { agentClis, planSkillHandOff, SkillHandOffError, type SkillHandOffPlan } from '../skills.ts'
import { terminalSafe } from '../terminal-text.ts'
import { parametersUnknownLabel } from '../vocabulary.ts'
import { kit, openSession } from './shared.ts'

/** The run document for a skill handed to an agent: `task` is the skill's id. */
function skillDocument(plan: SkillHandOffPlan, ran: boolean, exit: number | null): RunDocumentBody {
  return {
    task: plan.skill.id,
    display: skillLine(plan.skill),
    argv: plan.argv,
    command: commandString(plan.argv),
    cwd: plan.cwd,
    env: plan.env,
    ran,
    exit,
    unknowns: [],
  }
}

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
      'agent skill: type its /<name> in the agent. --agent hands a skill to an agent CLI ' +
      'instead, starting an interactive session in this terminal with the skill as its first ' +
      'prompt (claude "/review 123"); the words after -- follow the name, as its argument hint ' +
      'asks. It starts the first of claude, codex and cursor-agent on PATH that reads the ' +
      'skill, or the one --harness names.',
    positionals: [
      {
        name: 'id',
        required: true,
        help: 'the task id, as "list --json" shows it, or its line from "list"',
      },
    ],
    rest: { name: 'args' },
    flags: {
      cached: {
        kind: 'boolean',
        help: 'find the task in the last saved listing, not a new probe; files are not checked',
      },
      dryRun: { kind: 'boolean', help: 'print what would run, and run nothing' },
      check: {
        kind: 'boolean',
        hidden: true,
        help: "with --cached --dry-run, probe the task's runner again as a run does",
      },
      agent: {
        kind: 'boolean',
        help: 'on an agent skill: start an agent CLI with it as the first prompt',
      },
      harness: {
        kind: 'enum',
        choices: HANDOFF_HARNESSES,
        valueName: 'H',
        help: 'with --agent, the agent to start (default: the first on PATH that reads the skill)',
      },
    },
    output: RunOutput,
    kind: 'run',
    examples: [
      'run just:justfile:build',
      'run node-scripts:package.json:test -- --watch',
      'run x --dry-run --json',
      'run /review --agent -- 123',
    ],
    // Running a task is the command line's; an adapter may only ask what would run.
    exposureOf: (input) => (input.flags.dryRun === true ? 'all' : 'cli-only'),
    async run({ flags, globals, positionals, rest }, ctx) {
      if (ctx.json && !flags.dryRun) {
        throw new UsageError('--json needs --dry-run: a running task writes to stdout itself')
      }
      const session = await openSession(globals, ctx, home)
      const snapshot = await session.catalog({ cached: flags.cached })
      const id = positionals[0]!
      const skill = snapshot.skills.find((s) => s.id === id || s.invoke === id)
      if (flags.agent || flags.harness !== undefined) {
        if (skill === undefined) {
          throw new UsageError(`--agent starts an agent skill, and ${terminalSafe(id)} is not one`)
        }
        let started: SkillHandOffPlan
        try {
          started = planSkillHandOff(skill, {
            root: session.root,
            env: session.env,
            args: rest.join(' '),
            harness: flags.harness,
          })
        } catch (err) {
          if (err instanceof SkillHandOffError) {
            throw new CommandError(err.message, {
              code: 'not-runnable',
              ...(err.hint !== undefined ? { hint: err.hint } : {}),
            })
          }
          throw err
        }
        if (skill.argumentHint !== null && rest.length === 0) {
          ctx.note(terminalSafe(`${skill.invoke} takes ${skill.argumentHint}; none given`))
        }
        if (flags.dryRun) return skillDocument(started, false, null)
        ctx.io.stderr(`$ ${terminalSafe(commandString(started.argv))}\n`)
        const ended = handOff(started)
        if (ended.error !== undefined) {
          throw new CommandError(`${started.argv[0]}: ${ended.error}`, { code: 'spawn' })
        }
        return outcome(skillDocument(started, true, ended.exit), ended.exit)
      }
      let plan: RunPlan
      try {
        plan = session.resolveRun(snapshot.catalog, id, rest)
      } catch (err) {
        if (err instanceof SessionError && err.code === 'task-not-found' && skill !== undefined) {
          const shown = terminalSafe(skill.invoke)
          const readers = terminalSafe(skill.harnesses.join(', '))
          const startable = agentClis(skill, session.env).length > 0
          throw new CommandError(`${shown}: a skill runs in an agent, not here`, {
            code: 'not-runnable',
            hint: startable
              ? `type ${shown} in ${readers}, or start one with it: ${BIN} run ${shown} --agent`
              : `type ${shown} in ${readers}`,
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
      // A task from a saved or stored listing runs only as its runner reads it
      // now. A dry run is a preview, so it may come from the listing.
      const probedNow = snapshot.origin === 'probe' || snapshot.origin === 'empty-store'
      if (!probedNow && (!flags.dryRun || flags.check)) {
        try {
          plan = await session.confirmRun(plan, rest, ctx.signal)
        } catch (err) {
          if (err instanceof SessionError) {
            throw new CommandError(err.message, {
              code: err.code,
              ...(err.hint !== undefined ? { hint: err.hint } : {}),
            })
          }
          throw err
        }
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
