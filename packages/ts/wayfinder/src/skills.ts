/**
 * Read the agent skills for the Skills group from `@osdlc/detect-harness`.
 * It reads files only. No harness program runs, and no skill runs.
 */

import { isAbsolute, relative } from 'node:path'

import { detect } from '@osdlc/detect-harness'

import type { SkillRow, SkillsSetting } from './core/skills.ts'

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
