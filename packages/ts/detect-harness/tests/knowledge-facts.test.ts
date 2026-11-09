/**
 * The location table's hard-coded harness facts against the harness knowledge file.
 *
 * A fact is read from the file when it states one at moderate strength or better and
 * the table agrees; otherwise it stays a constant, noted `// knowledge:` in
 * src/locations.ts. This test pins which facts the file states today, so a new or changed
 * statement fails here and sends someone to wire it or to settle the disagreement.
 */
import { fact, loadKnowledge } from '@osdlc/harness-knowledge'
import { describe, expect, test } from 'vitest'

import { LOCATIONS } from '../src/locations.ts'

const SUBJECTS = [
  'cli/binary',
  'cli/current-env',
  'config/config-dir-env',
  'skills/user-dirs',
  'skills/project-dirs',
  'instructions/files',
] as const

const HARNESS = {
  claude: 'claude-code',
  codex: 'codex',
  cursor: 'cursor',
  opencode: 'opencode',
  pi: 'pi',
  antigravity: 'antigravity',
} as const

/**
 * What the file states at moderate strength or better and undisputed, the dirs it lists.
 * Everything else is missing, weak or disputed (codex and pi skills/project-dirs are disputed).
 */
const STATED: Record<string, readonly string[]> = {
  'codex skills/user-dirs': ['~/.agents/skills'],
  'cursor skills/user-dirs': ['~/.agents/skills', '~/.cursor/skills'],
  'pi skills/user-dirs': ['~/.pi/agent/skills', '~/.agents/skills'],
}

describe('the location table and the knowledge file agree', () => {
  test('the file defines every subject and harness the table asks about', () => {
    const k = loadKnowledge()
    for (const s of SUBJECTS) expect(k.subjects[s], s).toBeDefined()
    for (const h of Object.values(HARNESS)) expect(k.harnesses[h], h).toBeDefined()
  })

  test('the file states exactly the facts pinned here', () => {
    const stated: Record<string, unknown> = {}
    for (const [id, harness] of Object.entries(HARNESS)) {
      for (const s of SUBJECTS) {
        const dirs = fact(harness, s)?.['dirs']
        if (fact(harness, s) !== undefined) stated[`${id} ${s}`] = dirs
      }
    }
    expect(stated).toEqual(STATED)
  })

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
