/**
 * The Skills group: agent skills read from the repository's skill folders
 * (and the home folder's with `skills: "all"`), searched like tasks, shown
 * as `/<name>` lines, and never run.
 */

import { afterAll, describe, expect, test } from 'vitest'

import { captureIo } from '@osdlc/cli-tool'

import { CONFIG_ENV_VAR } from '../src/app.ts'
import { main } from '../src/cli.ts'
import { filterSkills, skillLine, type SkillRow } from '../src/core/skills.ts'
import { createSession } from '../src/core/session.ts'
import { readSkills } from '../src/skills.ts'
import { fixtureRoot, removeRoot, shown } from './support.ts'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

async function root(files: Record<string, string>): Promise<string> {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return dir
}

function skillFile(name: string, description: string, hint?: string): string {
  const lines = ['---', `name: ${name}`, `description: ${description}`]
  if (hint !== undefined) lines.push(`argument-hint: ${hint}`)
  return [...lines, '---', '', 'Body.', ''].join('\n')
}

const REPO = {
  'package.json': '{"name":"p","scripts":{"build":"tsc"}}',
  '.claude/skills/review/SKILL.md': skillFile('review', 'Review a pull request.', '[pr-number]'),
  '.agents/skills/release/SKILL.md': skillFile('release', 'Cut a release.'),
}

async function way(argv: string[], home: string, env: Record<string, string> = {}) {
  const io = captureIo()
  const code = await main(argv, env, home, io)
  return { code, out: io.out, err: io.err }
}

describe('readSkills', () => {
  test('lists the project skills with their hint, origin and agents, paths from the root', async () => {
    const dir = await root(REPO)
    const skills = await readSkills(dir, { setting: 'project', home: dir, env: {} })
    expect(skills.map((s) => s.name)).toEqual(['release', 'review'])
    const review = skills.find((s) => s.name === 'review')!
    expect(review).toMatchObject({
      id: 'skill:.claude/skills/review/SKILL.md',
      description: 'Review a pull request.',
      argumentHint: '[pr-number]',
      path: '.claude/skills/review/SKILL.md',
      origin: 'project',
      harnesses: ['claude'],
      invoke: '/review',
    })
    const release = skills.find((s) => s.name === 'release')!
    expect(release.harnesses).toContain('codex')
    expect(release.argumentHint).toBeNull()
  })

  test('off reads nothing', async () => {
    const dir = await root(REPO)
    expect(await readSkills(dir, { setting: 'off', home: dir, env: {} })).toEqual([])
  })

  test('project leaves out the home folder; all adds it after the project ones', async () => {
    const dir = await root(REPO)
    const home = await root({ '.claude/skills/mine/SKILL.md': skillFile('mine', 'My own.') })
    const project = await readSkills(dir, { setting: 'project', home, env: {} })
    expect(project.map((s) => s.name)).not.toContain('mine')
    const all = await readSkills(dir, { setting: 'all', home, env: {} })
    const mine = all.find((s) => s.name === 'mine')!
    expect(mine.origin).toBe('user')
    expect(mine.path.startsWith(home)).toBe(true)
    expect(all.at(-1)?.name).toBe('mine')
  })
})

describe('filterSkills', () => {
  const skills: SkillRow[] = [
    row('review', 'Review a pull request.'),
    row('release', 'Cut a release.'),
  ]

  test('no query keeps every skill in order', () => {
    expect(filterSkills(skills).map((h) => h.skill.name)).toEqual(['review', 'release'])
  })

  test('matches the name and the description, best first', () => {
    expect(filterSkills(skills, { query: 'rel' }).map((h) => h.skill.name)[0]).toBe('release')
    expect(filterSkills(skills, { query: 'pull' }).map((h) => h.skill.name)).toEqual(['review'])
  })

  test('--services and a runner filter keep no skill', () => {
    expect(filterSkills(skills, { servicesOnly: true })).toEqual([])
    expect(filterSkills(skills, { runners: ['just'] })).toEqual([])
  })

  test('skillLine adds the hint', () => {
    expect(skillLine({ invoke: '/review', argumentHint: '[pr-number]' })).toBe(
      '/review [pr-number]',
    )
    expect(skillLine({ invoke: '/release', argumentHint: null })).toBe('/release')
  })
})

describe('the Skills group on the CLI', () => {
  test('list prints the skills after the tasks; --json has them and the Skills group', async () => {
    const dir = await root(REPO)
    const text = await way(['list', '-C', dir], dir)
    expect(text.code).toBe(0)
    expect(text.out.trimEnd().split('\n')).toEqual([
      shown('npm run build'),
      shown('npm install'),
      '/release',
      '/review [pr-number]',
    ])
    const json = await way(['list', '--json', '-C', dir], dir)
    const doc = JSON.parse(json.out) as {
      groups: Array<{ id: string; runners: string[] }>
      skills: SkillRow[]
    }
    expect(doc.groups.at(-1)).toEqual({ id: 'skills', title: 'Skills', runners: [] })
    expect(doc.skills.map((s) => s.invoke)).toEqual(['/release', '/review'])
  })

  test('query finds a skill like a task, and exits 1 only when nothing matches', async () => {
    const dir = await root(REPO)
    const hit = await way(['query', 'pull', 'request', '-C', dir], dir)
    expect(hit.code).toBe(0)
    expect(hit.out).toBe('/review [pr-number]\n')
    const json = JSON.parse((await way(['query', 'review', '--json', '-C', dir], dir)).out) as {
      skills: SkillRow[]
    }
    expect(json.skills.map((s) => s.name)).toEqual(['review'])
    expect((await way(['query', 'zzzz', '-C', dir], dir)).code).toBe(1)
  })

  test('the skills setting off removes the group', async () => {
    const dir = await root(REPO)
    const user = await root({ 'config.json': '{"skills": "off"}' })
    const env = { [CONFIG_ENV_VAR]: `${user}/config.json` }
    const doc = JSON.parse((await way(['list', '--json', '-C', dir], dir, env)).out) as {
      groups: Array<{ id: string }>
      skills: SkillRow[]
    }
    expect(doc.skills).toEqual([])
    expect(doc.groups.map((g) => g.id)).not.toContain('skills')
  })

  test('a project file cannot set skills', async () => {
    const dir = await root({ ...REPO, 'wayfinder.config.json': '{"skills": "all"}' })
    const session = await createSession({ dir, cwd: dir, env: {}, home: dir })
    expect(session.settings().settings.skills).toMatchObject({
      value: 'project',
      source: 'default',
    })
    expect(session.warnings.join('\n')).toContain('skills is ignored in a project file')
  })

  test('a control character in a skill name or hint does not reach the terminal', async () => {
    const dir = await root({
      'package.json': '{"name":"p"}',
      '.claude/skills/evil/SKILL.md': skillFile('evil\u001b]52;c;aGk=\u0007', 'x', '[a]\u001b[2J'),
    })
    const text = await way(['list', '-C', dir], dir)
    expect(text.out).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/)
    expect(text.out).toContain('/evil�]52;c;aGk=� [a]�[2J')
    const json = await way(['list', '--json', '-C', dir], dir)
    const doc = JSON.parse(json.out) as { skills: SkillRow[] }
    // JSON keeps the value exact.
    expect(doc.skills[0]?.name).toBe('evil\u001b]52;c;aGk=\u0007')
  })

  test('way run of a skill is refused with what to do instead', async () => {
    const dir = await root(REPO)
    const ran = await way(['run', '/review', '-C', dir], dir)
    expect(ran.code).not.toBe(0)
    expect(ran.err).toContain('a skill runs in an agent')
  })
})

function row(name: string, description: string): SkillRow {
  return {
    id: `skill:.claude/skills/${name}/SKILL.md`,
    name,
    description,
    argumentHint: null,
    path: `.claude/skills/${name}/SKILL.md`,
    scope: 'project',
    origin: 'project',
    harnesses: ['claude'],
    invoke: `/${name}`,
  }
}

test('a skill file is one row, each agent named once', async () => {
  const dir = await root({ '.agents/skills/x/SKILL.md': skillFile('x', 'X.') })
  const rows = await readSkills(dir, { setting: 'project', home: dir, env: {} })
  expect(rows).toHaveLength(1)
  expect(new Set(rows[0]!.harnesses).size).toBe(rows[0]!.harnesses.length)
})
