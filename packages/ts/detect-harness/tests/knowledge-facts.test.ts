/**
 * The location table's hard-coded harness facts against the harness knowledge file.
 *
 * A fact is read from the file when it states one at moderate strength or better and
 * the table agrees; otherwise it stays a constant. This test asserts the constants against
 * the file (binary, detection variables, config folder variable, skills folders) and pins
 * the stated folders the table leaves out, so a new or changed statement fails here and
 * sends someone to wire it or to settle the disagreement.
 */
import { fact, loadKnowledge } from '@osdlc/harness-knowledge'
import { describe, expect, test } from 'vitest'

import { LOCATIONS } from '../src/locations.ts'

const HARNESS = {
  claude: 'claude-code',
  codex: 'codex',
  cursor: 'cursor',
  opencode: 'opencode',
  pi: 'pi',
  antigravity: 'antigravity',
} as const
type Id = keyof typeof HARNESS

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

/** The table's skills folders for a scope, as the knowledge file spells them (`~/` or project-relative). */
function tableSkills(id: Id, scope: 'user' | 'project'): string[] {
  const loc = LOCATIONS[id]
  const config = loc.bases['config']?.default
  const home = typeof config === 'string' ? config : undefined
  return loc.paths
    .filter((x) => x.role === 'skills' && x.scope === scope)
    .map((x) =>
      x.path
        .replace('{config}', home ?? '{config}')
        .replace('{project}/', '')
        .replace('<cwd>/', ''),
    )
}

/** What the file states at moderate strength or better that the table leaves out. */
const GAPS: Record<string, readonly string[]> = {
  'cursor skills/user-dirs': ['~/.agents/skills'],
  'cursor skills/project-dirs': ['.agents/skills'],
  'pi skills/user-dirs': ['~/.agents/skills'],
  'pi skills/project-dirs': ['.agents/skills'],
  'antigravity skills/user-dirs': ['~/.gemini/skills'],
}

describe('the location table and the knowledge file agree', () => {
  test('the file defines every harness the table asks about', () => {
    const k = loadKnowledge()
    for (const h of Object.values(HARNESS)) expect(k.harnesses[h], h).toBeDefined()
  })

  for (const [id, harness] of Object.entries(HARNESS) as [Id, string][]) {
    const loc = LOCATIONS[id]
    describe(id, () => {
      test('the binary is the stated name or one of its aliases', () => {
        const f = fact(harness, 'cli/binary')
        expect(f, 'cli/binary').toBeDefined()
        expect([f?.['name'], ...strings(f?.['aliases'])]).toContain(loc.binary)
      })

      test('the harness-detection variables are stated ones', () => {
        const f = fact(harness, 'cli/current-env')
        if (f === undefined) return // weak or not stated: the table's constants stand
        const vars = (f['vars'] as { name: string }[]).map((v) => v.name)
        for (const name of loc.currentEnv) expect(vars, name).toContain(name)
      })

      test('the config folder variable is the stated one', () => {
        const f = fact(harness, 'config/config-dir-env')
        const names = (loc.bases['config']?.env ?? []).map((e) => e.name)
        if (f === undefined) return
        // opencode and cursor honour a variable the table does not read (XDG_CONFIG_HOME there).
        if (id === 'opencode' || id === 'cursor') return expect(names).not.toContain(f['var'])
        expect(names).toContain(f['var'])
      })

      for (const scope of ['user', 'project'] as const) {
        const subject = `skills/${scope}-dirs`
        test(`${subject}: the table lists only stated folders; the gaps are pinned`, () => {
          const f = fact(harness, subject)
          if (f === undefined) return // weak, disputed or not stated: the table's constants stand
          // Codex's older folder is deprecated but still read, so the table keeps it.
          const stated = [
            ...strings(f['dirs']).map((d) => d.replace('<cwd>/', '')),
            ...strings(f['deprecated']),
            ...strings([f['moved_from']]),
          ].map((d) => d.replace('$CODEX_HOME', '~/.codex'))
          const have = tableSkills(id, scope)
          for (const dir of have) expect(stated, dir).toContain(dir)
          expect(
            stated.filter((d) => !have.includes(d)),
            `${id} ${subject}`,
          ).toEqual(GAPS[`${id} ${subject}`] ?? [])
        })
      }
    })
  }

  test('the wired fact resolves, and the table holds it', () => {
    expect(fact('codex', 'skills/user-dirs')?.['dirs']).toContain('~/.agents/skills')
    const userSkills = LOCATIONS.codex.paths.filter(
      (p) => p.role === 'skills' && p.scope === 'user',
    )
    expect(userSkills.map((p) => p.path)).toEqual(['{config}/skills', '~/.agents/skills'])
  })

  test('every statement the table reads from the file has a basis link', () => {
    const k = loadKnowledge()
    const v = k.values.find((x) => x.harness === 'codex' && x.subject === 'skills/user-dirs')
    expect(v?.basis).toMatch(/^https:\/\/github\.com\//)
  })
})
