/**
 * Handing an agent skill to an agent's CLI: `way run /<name> --agent` and
 * the planning under it. The agent CLIs are fake scripts on a throwaway
 * PATH, so no real agent starts.
 */

import { chmod, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

import { afterAll, describe, expect, test } from 'vitest'

import { captureIo } from '@osdlc/cli-tool'

import { main } from '../src/cli.ts'
import { isHandOffHarness, skillPrompt, type SkillRow } from '../src/core/skills.ts'
import { agentClis, planSkillHandOff, SkillHandOffError } from '../src/skills.ts'
import { fixtureRoot, removeRoot } from './support.ts'

const POSIX = process.platform !== 'win32'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

async function root(files: Record<string, string>): Promise<string> {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return dir
}

/** A directory of executable scripts, one per name, for PATH. */
async function bin(scripts: Record<string, string>): Promise<string> {
  const dir = await root(scripts)
  await Promise.all(Object.keys(scripts).map((name) => chmod(join(dir, name), 0o755)))
  return dir
}

/** A script that exits 0 and does nothing. */
const NOOP = '#!/bin/sh\nexit 0\n'

function skill(over: Partial<SkillRow> = {}): SkillRow {
  return {
    id: 'skill:.claude/skills/review/SKILL.md',
    name: 'review',
    description: 'Review a pull request.',
    argumentHint: '[pr-number]',
    path: '.claude/skills/review/SKILL.md',
    scope: 'project',
    origin: 'project',
    harnesses: ['claude'],
    invoke: '/review',
    ...over,
  }
}

function refusal(fn: () => unknown): SkillHandOffError {
  try {
    fn()
  } catch (err) {
    if (err instanceof SkillHandOffError) return err
    throw err
  }
  throw new Error('expected a SkillHandOffError')
}

describe('skillPrompt', () => {
  test('names the skill as each harness does, then the arguments', () => {
    expect(skillPrompt({ name: 'review' }, 'claude', '123')).toBe('/review 123')
    expect(skillPrompt({ name: 'review' }, 'cursor', '123')).toBe('/review 123')
    expect(skillPrompt({ name: 'review' }, 'codex', '123')).toBe('$review 123')
  })

  test('no arguments, or only spaces, give the name alone', () => {
    expect(skillPrompt({ name: 'review' }, 'claude')).toBe('/review')
    expect(skillPrompt({ name: 'review' }, 'claude', '   ')).toBe('/review')
    expect(skillPrompt({ name: 'review' }, 'claude', '  12  fix ')).toBe('/review 12  fix')
  })

  test('only claude, codex and cursor are started', () => {
    expect(['claude', 'codex', 'cursor'].every(isHandOffHarness)).toBe(true)
    expect(isHandOffHarness('opencode')).toBe(false)
    expect(isHandOffHarness('cursor-agent')).toBe(false)
  })
})

describe.skipIf(!POSIX)('agentClis', () => {
  test('each harness that reads the skill and is on PATH, claude, codex, cursor in turn', async () => {
    const dir = await bin({ claude: NOOP, codex: NOOP, 'cursor-agent': NOOP })
    const clis = agentClis(skill({ harnesses: ['cursor', 'codex', 'claude'] }), { PATH: dir })
    expect(clis).toEqual([
      { harness: 'claude', binary: 'claude', path: join(dir, 'claude') },
      { harness: 'codex', binary: 'codex', path: join(dir, 'codex') },
      { harness: 'cursor', binary: 'cursor-agent', path: join(dir, 'cursor-agent') },
    ])
  })

  test('leaves out a harness that does not read the skill, or is not on PATH', async () => {
    const dir = await bin({ claude: NOOP, codex: NOOP })
    expect(agentClis(skill({ harnesses: ['codex'] }), { PATH: dir }).map((c) => c.harness)).toEqual(
      ['codex'],
    )
    expect(agentClis(skill({ harnesses: ['cursor'] }), { PATH: dir })).toEqual([])
    expect(agentClis(skill(), {})).toEqual([])
  })

  test('a relative PATH entry is not searched, so the repository cannot ship the agent', async () => {
    const repo = await bin({ claude: NOOP })
    expect(agentClis(skill(), { PATH: relative(process.cwd(), repo) }, 'linux')).toEqual([])
    expect(agentClis(skill(), { PATH: repo }, 'linux')).toHaveLength(1)
  })
})

describe.skipIf(!POSIX)('planSkillHandOff', () => {
  test('starts the first CLI with the prompt, in the root, adding no variables', async () => {
    const dir = await bin({ claude: NOOP, codex: NOOP })
    const plan = planSkillHandOff(skill({ harnesses: ['claude', 'codex'] }), {
      root: '/repo',
      env: { PATH: dir },
      args: '123',
    })
    expect(plan).toMatchObject({
      harness: 'claude',
      prompt: '/review 123',
      argv: [join(dir, 'claude'), '/review 123'],
      env: {},
      cwd: '/repo',
    })
  })

  test('--harness picks another that reads it, with its own mention', async () => {
    const dir = await bin({ claude: NOOP, codex: NOOP })
    const plan = planSkillHandOff(skill({ harnesses: ['claude', 'codex'] }), {
      root: '/repo',
      env: { PATH: dir },
      harness: 'codex',
    })
    expect(plan.argv).toEqual([join(dir, 'codex'), '$review'])
  })

  test('a harness that does not read the skill is refused, naming the ones that do', async () => {
    const dir = await bin({ claude: NOOP, codex: NOOP })
    const err = refusal(() =>
      planSkillHandOff(skill(), { root: '/r', env: { PATH: dir }, harness: 'codex' }),
    )
    expect(err.message).toBe('/review: codex does not read this skill')
    expect(err.hint).toBe('it is for claude')
  })

  test('a harness that reads it but is not on PATH is refused', async () => {
    const dir = await bin({ claude: NOOP })
    const err = refusal(() =>
      planSkillHandOff(skill({ harnesses: ['claude', 'cursor'] }), {
        root: '/r',
        env: { PATH: dir },
        harness: 'cursor',
      }),
    )
    expect(err.message).toBe('/review: cursor-agent is not on PATH')
  })

  test('a harness wayfinder does not start is refused', () => {
    const err = refusal(() =>
      planSkillHandOff(skill(), { root: '/r', env: {}, harness: 'opencode' }),
    )
    expect(err.message).toBe('way cannot start opencode')
    expect(err.hint).toBe('it starts claude, codex, cursor')
  })

  test('with no CLI on PATH it says which binaries it looked for', () => {
    const err = refusal(() =>
      planSkillHandOff(skill({ harnesses: ['claude', 'codex'] }), { root: '/r', env: {} }),
    )
    expect(err.message).toBe('/review: no agent CLI that reads it is on PATH')
    expect(err.hint).toBe('looked for claude, codex; type /review in claude, codex')
  })

  test('a control character in the name or the arguments starts nothing', async () => {
    const dir = await bin({ claude: NOOP })
    const env = { PATH: dir }
    const named = refusal(() =>
      planSkillHandOff(skill({ name: 'x\u001b[2J', invoke: '/x\u001b[2J' }), { root: '/r', env }),
    )
    expect(named.message).toBe('/x�[2J: not started: it holds a control character')
    const typed = refusal(() =>
      planSkillHandOff(skill(), { root: '/r', env, args: '1\necho PWNED' }),
    )
    expect(typed.message).toContain('control character')
  })
})

const SKILL_FILE = [
  '---',
  'name: review',
  'description: Review a pull request.',
  'argument-hint: "[pr-number]"',
  '---',
  'Body.',
  '',
].join('\n')

const REPO = {
  'package.json': '{"name":"p","scripts":{"build":"tsc"}}',
  '.claude/skills/review/SKILL.md': SKILL_FILE,
}

async function way(argv: string[], home: string, env: Record<string, string> = {}) {
  const io = captureIo()
  const code = await main(argv, env, home, io)
  return { code, out: io.out, err: io.err }
}

describe.skipIf(!POSIX)('way run /<skill> --agent', () => {
  test('--dry-run --json is the run document for the agent CLI', async () => {
    const dir = await root(REPO)
    const path = await bin({ claude: NOOP })
    const res = await way(
      ['run', '/review', '--agent', '--dry-run', '--json', '-C', dir, '--', '123'],
      dir,
      { PATH: path },
    )
    expect(res.code).toBe(0)
    const doc = JSON.parse(res.out) as Record<string, unknown>
    expect(doc).toMatchObject({
      task: 'skill:.claude/skills/review/SKILL.md',
      display: '/review [pr-number]',
      argv: [join(path, 'claude'), '/review 123'],
      env: {},
      ran: false,
      exit: null,
      unknowns: [],
    })
  })

  test('starts the CLI with the prompt and exits with its code', async () => {
    const dir = await root(REPO)
    const out = join(dir, 'argv.txt')
    const path = await bin({ claude: `#!/bin/sh\nprintf '%s\\n' "$@" > '${out}'\nexit 3\n` })
    const res = await way(['run', '/review', '--agent', '-C', dir, '--', '42', 'now'], dir, {
      PATH: path,
    })
    expect(res.code).toBe(3)
    expect(await readFile(out, 'utf-8')).toBe('/review 42 now\n')
    expect(res.err).toContain(`$ ${join(path, 'claude')} '/review 42 now'`)
  })

  test('with no arguments it says what the hint asks for, and starts anyway', async () => {
    const dir = await root(REPO)
    const path = await bin({ claude: NOOP })
    const res = await way(['run', '/review', '--agent', '-C', dir], dir, { PATH: path })
    expect(res.code).toBe(0)
    expect(res.err).toContain('/review takes [pr-number]; none given')
  })

  test('--harness alone asks for the hand-off, and is refused for an agent that does not read it', async () => {
    const dir = await root(REPO)
    const path = await bin({ claude: NOOP, codex: NOOP })
    const res = await way(['run', '/review', '--harness', 'codex', '-C', dir], dir, {
      PATH: path,
    })
    expect(res.code).toBe(1)
    expect(res.err).toContain('/review: codex does not read this skill')
    expect(res.err).toContain('it is for claude')
  })

  test('a harness it does not start is a usage error', async () => {
    const dir = await root(REPO)
    const res = await way(['run', '/review', '--harness', 'opencode', '-C', dir], dir)
    expect(res.code).toBe(2)
  })

  test('with no agent CLI on PATH it is refused, and nothing runs', async () => {
    const dir = await root(REPO)
    const res = await way(['run', '/review', '--agent', '-C', dir], dir, { PATH: '' })
    expect(res.code).toBe(1)
    expect(res.err).toContain('/review: no agent CLI that reads it is on PATH')
    expect(res.err).not.toContain('$ ')
  })

  test('--agent on a task is a usage error', async () => {
    const dir = await root(REPO)
    const path = await bin({ claude: NOOP })
    const res = await way(['run', 'npm run build', '--agent', '-C', dir], dir, { PATH: path })
    expect(res.code).toBe(2)
    expect(res.err).toContain('--agent starts an agent skill, and npm run build is not one')
  })

  test('without --agent a skill is still refused; the hint offers --agent when a CLI is there', async () => {
    const dir = await root(REPO)
    const path = await bin({ claude: NOOP })
    const found = await way(['run', '/review', '-C', dir], dir, { PATH: path })
    expect(found.code).toBe(1)
    expect(found.err).toContain('a skill runs in an agent, not here')
    expect(found.err).toContain('way run /review --agent')
    const absent = await way(['run', '/review', '-C', dir], dir, { PATH: '' })
    expect(absent.err).toContain('type /review in claude')
    expect(absent.err).not.toContain('--agent')
  })
})
