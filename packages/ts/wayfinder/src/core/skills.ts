/**
 * Agent skills as catalog rows: the Skills group. A skill is not a task. It
 * has no command line; an agent runs it when a person types `/<name>`. So
 * the run action copies {@link SkillRow.invoke} and nothing is spawned.
 *
 * Skill names, descriptions and hints come from files in the repository or
 * the user's config. Filter them like any repository text before printing.
 *
 * Browser-safe: it imports only the matcher, so the page can use it.
 */

import { matchEntry, terms as splitTerms } from '@osdlc/system-model/match'

import type { TaskFilter } from './filter.ts'

/** Which skills a catalog lists: the `skills` setting. */
export const SKILLS_SETTING_VALUES = ['project', 'all', 'off'] as const

/**
 * `project`: the skills the repository ships (the default). `all`: those and
 * the user's and plugins' skills, read from the home folder. `off`: none.
 */
export type SkillsSetting = (typeof SKILLS_SETTING_VALUES)[number]

/** One agent skill. */
export interface SkillRow {
  /** Stable: `skill:` and the skill file's path. */
  id: string
  name: string
  description: string | null
  /** What to type after `/<name>`, such as `[pr-number]`. Null when the file sets none. */
  argumentHint: string | null
  /** The `SKILL.md` file: relative to the root inside it, else absolute. */
  path: string
  /** The config scope it was found in: `project`, `local`, `user` and so on. */
  scope: string
  /** `project`, `user`, `local`, `managed`, or `plugin:<id>`. */
  origin: string
  /** The agents that read this skill file: `claude`, `codex`, `cursor`. */
  harnesses: string[]
  /** What the run action copies: `/<name>`. */
  invoke: string
}

/** One kept skill, with its score and the offsets its name matched at. */
export interface SkillHit {
  skill: SkillRow
  /** 0 when there is no query. */
  score: number
  /** Offsets into `skill.name`, when the name is what matched. */
  labelHits: number[] | null
}

/** The text a surface shows for a skill: `/review [pr-number]`. */
export function skillLine(skill: Pick<SkillRow, 'invoke' | 'argumentHint'>): string {
  return skill.argumentHint === null ? skill.invoke : `${skill.invoke} ${skill.argumentHint}`
}

/** Whether `skill` passes the parts of `filter` a skill has. */
function keepsSkill(filter: TaskFilter): boolean {
  // A skill does not run until stopped, and is not a runner's.
  if (filter.servicesOnly === true) return false
  if (filter.runners !== undefined) return false
  return true
}

/**
 * The skills that pass `filter`, matched like tasks: by name, then the
 * `/<name>` line, the description and the origin. With a query they are
 * ranked best first; without one they keep their order.
 */
export function filterSkills(skills: readonly SkillRow[], filter: TaskFilter = {}): SkillHit[] {
  if (!keepsSkill(filter)) return []
  const queryTerms = splitTerms(filter.query ?? '')
  if (queryTerms.length === 0) return skills.map((skill) => ({ skill, score: 0, labelHits: null }))
  const mode = filter.mode ?? 'fuzzy'
  const hits: SkillHit[] = []
  for (const skill of skills) {
    const entry = {
      path: [skill.name],
      display: skillLine(skill),
      doc: skill.description ?? '',
      detail: '',
      tags: [skill.origin, ...skill.harnesses],
    }
    const m = matchEntry(entry, queryTerms, mode)
    if (m !== null) hits.push({ skill, score: m.score, labelHits: m.labelHits })
  }
  hits.sort((a, b) => b.score - a.score)
  return hits
}
