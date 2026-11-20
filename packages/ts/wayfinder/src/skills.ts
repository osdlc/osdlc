/**
 * Read the agent skills for the Skills group from `@osdlc/detect-harness`.
 * It reads files only. No harness program runs, and no skill runs.
 *
 * {@link planSkillHandOff} plans the one explicit action that does start a
 * program: an agent's CLI with the skill as its first prompt. It looks the
 * CLI up on `PATH` and spawns nothing itself.
 */

import { isAbsolute, relative } from 'node:path'

import { detect, LOCATIONS, which } from '@osdlc/detect-harness'

import { BIN } from './app.ts'
import {
  HANDOFF_HARNESSES,
  isHandOffHarness,
  skillPrompt,
  type HandOffHarness,
  type SkillRow,
  type SkillsSetting,
} from './core/skills.ts'
import { hasControls, terminalSafe } from './terminal-text.ts'

/** What {@link readSkills} needs. */
export interface ReadSkillsOptions {
  /** Which skills: `project` reads the repository only; `all` adds the home folder's. */
  setting: SkillsSetting
  home: string
  env: Record<string, string | undefined>
  signal?: AbortSignal | undefined
}

/** `path` relative to `root` with `/` separators when it is inside it, else as given. */
function underRoot(root: string, path: string): string {
  const rel = relative(root, path)
  const outside = rel === '' || rel === '..' || /^\.\.[\\/]/.test(rel) || isAbsolute(rel)
  return outside ? path : rel.split('\\').join('/')
}

/**
 * The skills for `root`, project ones first, then by name. A skill file
 * several agents read is one row that names each of them. `off` reads
 * nothing.
 */
export async function readSkills(root: string, opts: ReadSkillsOptions): Promise<SkillRow[]> {
  if (opts.setting === 'off') return []
  const catalog = await detect({
    projectRoot: root,
    home: opts.home,
    env: opts.env,
    mode: opts.setting === 'all' ? 'full' : 'project',
    allowExec: false,
    ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
  })
  const byPath = new Map<string, SkillRow>()
  for (const report of catalog.reports) {
    for (const skill of report.skills) {
      const path = underRoot(root, skill.path)
      const seen = byPath.get(path)
      if (seen !== undefined) {
        if (!seen.harnesses.includes(report.harness)) seen.harnesses.push(report.harness)
        continue
      }
      byPath.set(path, {
        id: `skill:${path}`,
        name: skill.name,
        description: skill.description,
        argumentHint: skill.argumentHint,
        path,
        scope: skill.scope,
        origin: skill.origin,
        harnesses: [report.harness],
        invoke: `/${skill.name}`,
      })
    }
  }
  const rank = (s: SkillRow): number => (s.origin === 'project' || s.origin === 'local' ? 0 : 1)
  return [...byPath.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}

/** An agent CLI on `PATH` that reads a skill. */
export interface AgentCli {
  harness: HandOffHarness
  /** The binary's name, as `@osdlc/detect-harness` knows it: `claude`, `codex`, `cursor-agent`. */
  binary: string
  /** Where it was found: absolute. */
  path: string
}

/**
 * The agent CLIs that can start `skill`, best first: each harness that reads
 * it, in {@link HANDOFF_HARNESSES} order, whose binary is on `env.PATH`.
 * Only absolute `PATH` entries are searched, so a file the repository ships
 * is never found. Nothing runs.
 */
export function agentClis(
  skill: Pick<SkillRow, 'harnesses'>,
  env: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform = process.platform,
): AgentCli[] {
  const clis: AgentCli[] = []
  for (const harness of HANDOFF_HARNESSES) {
    if (!skill.harnesses.includes(harness)) continue
    const binary = LOCATIONS[harness].binary
    const path = which(binary, env, platform)
    if (path !== null) clis.push({ harness, binary, path })
  }
  return clis
}

/** Why a skill cannot be handed off, with what to do instead. */
export class SkillHandOffError extends Error {
  readonly hint: string | undefined
  constructor(message: string, hint?: string) {
    super(message)
    this.name = 'SkillHandOffError'
    this.hint = hint
  }
}

/** A skill ready to hand to an agent's CLI. */
export interface SkillHandOffPlan {
  skill: SkillRow
  harness: HandOffHarness
  /** The first prompt: `/review 123`. */
  prompt: string
  /** The CLI's absolute path, then the prompt. Spawned without a shell. */
  argv: string[]
  /** Nothing is added to the environment. */
  env: Record<string, string>
  /** The project root: the agent starts in the repository. */
  cwd: string
}

/** What {@link planSkillHandOff} needs. */
export interface SkillHandOffOptions {
  /** The project root, where the agent starts. */
  root: string
  env: Readonly<Record<string, string | undefined>>
  /** What follows the skill's name in the prompt, as typed. */
  args?: string | undefined
  /** The harness to start. Default: the first of {@link agentClis}. */
  harness?: string | undefined
  platform?: NodeJS.Platform | undefined
}

/**
 * The plan that starts `skill` in an agent's CLI, as `claude "/review 123"`
 * does. Throws {@link SkillHandOffError} when the name or the arguments
 * hold a control character, when the harness asked for is not one wayfinder
 * starts or does not read the skill, or when no CLI that reads it is on
 * `PATH`.
 */
export function planSkillHandOff(skill: SkillRow, opts: SkillHandOffOptions): SkillHandOffPlan {
  const shown = terminalSafe(skill.invoke)
  const readers = terminalSafe(skill.harnesses.join(', '))
  const args = opts.args ?? ''
  if (hasControls(skill.name) || hasControls(args)) {
    throw new SkillHandOffError(`${shown}: not started: it holds a control character`)
  }
  const clis = agentClis(skill, opts.env, opts.platform)
  const asked = opts.harness
  let cli: AgentCli | undefined
  if (asked === undefined) {
    cli = clis[0]
    if (cli === undefined) {
      const wanted = HANDOFF_HARNESSES.filter((h) => skill.harnesses.includes(h))
      throw new SkillHandOffError(
        `${shown}: no agent CLI that reads it is on PATH`,
        wanted.length > 0
          ? `looked for ${wanted.map((h) => LOCATIONS[h].binary).join(', ')}; type ${shown} in ${readers}`
          : `${BIN} starts ${HANDOFF_HARNESSES.join(', ')}; type ${shown} in ${readers}`,
      )
    }
  } else {
    if (!isHandOffHarness(asked)) {
      throw new SkillHandOffError(
        `${BIN} cannot start ${terminalSafe(asked)}`,
        `it starts ${HANDOFF_HARNESSES.join(', ')}`,
      )
    }
    if (!skill.harnesses.includes(asked)) {
      throw new SkillHandOffError(
        `${shown}: ${asked} does not read this skill`,
        `it is for ${readers}`,
      )
    }
    cli = clis.find((c) => c.harness === asked)
    if (cli === undefined) {
      throw new SkillHandOffError(
        `${shown}: ${LOCATIONS[asked].binary} is not on PATH`,
        `install ${asked}, or type ${shown} in ${readers}`,
      )
    }
  }
  const prompt = skillPrompt(skill, cli.harness, args)
  return { skill, harness: cli.harness, prompt, argv: [cli.path, prompt], env: {}, cwd: opts.root }
}
