/**
 * The skills a repository ships, as project mode reports them, and the
 * `argument-hint` field on each skill, command and agent.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { join } from 'node:path'

import { argumentHintOf, parseFrontmatter } from '../src/frontmatter.ts'
import { readPlugin } from '../src/model/derive.ts'
import { fixture, type Fixture } from './fixture.ts'

let fx: Fixture
beforeEach(() => {
  fx = fixture()
})
afterEach(() => fx.cleanup())

const skill = (front: string): string => `---\n${front}\n---\n\nDo the thing.\n`

describe('argumentHintOf', () => {
  test('a string is trimmed', () => {
    expect(argumentHintOf({ 'argument-hint': '  <pr-number> [--mode auto|ask] ' })).toBe(
      '<pr-number> [--mode auto|ask]',
    )
  })

  test('unset, blank or not text is null', () => {
    expect(argumentHintOf({})).toBeNull()
    expect(argumentHintOf({ 'argument-hint': '   ' })).toBeNull()
    expect(argumentHintOf({ 'argument-hint': null })).toBeNull()
    expect(argumentHintOf({ 'argument-hint': ['message'] })).toBeNull()
    expect(argumentHintOf({ 'argument-hint': { a: 1 } })).toBeNull()
    expect(argumentHintOf({ 'argument-hint': 3 })).toBeNull()
  })
})

describe('parseFrontmatter reads argument-hint as the author typed it', () => {
  // The forms Claude Code skills and commands use. Most are not valid YAML,
  // or are YAML lists, when left unquoted.
  test.each([
    ['[message]', '[message]'],
    ['[pr-number] [priority]', '[pr-number] [priority]'],
    ['[--fix] <path>', '[--fix] <path>'],
    ['<pr-number> [--mode auto|ask]', '<pr-number> [--mode auto|ask]'],
    ['[[a], b]', '[[a], b]'],
    ['[a: 1]', '[a: 1]'],
    ['[file] # the file to check', '[file]'],
    ['[#123]', '[#123]'],
    ['add [tagId] | remove [tagId] | list', 'add [tagId] | remove [tagId] | list'],
    ['"[quoted] [hint]"', '[quoted] [hint]'],
    ["'[single] [quoted]'", '[single] [quoted]'],
    ['3', '3'],
  ])('argument-hint: %s', (written, hint) => {
    const fm = parseFrontmatter(skill(`name: s\ndescription: S.\nargument-hint: ${written}`))
    expect(fm).toMatchObject({ name: 's', description: 'S.' })
    expect(argumentHintOf(fm!)).toBe(hint)
  })

  test('a block scalar hint is read as YAML', () => {
    const fm = parseFrontmatter(skill('argument-hint: >-\n  [a]\n  [b]'))
    expect(argumentHintOf(fm!)).toBe('[a] [b]')
  })

  test('the other keys still parse as YAML', () => {
    const fm = parseFrontmatter(
      skill('argument-hint: [a] [b]\nallowed-tools:\n  - Bash\n  - Read\nmodel: sonnet'),
    )
    expect(fm).toEqual({
      'argument-hint': '[a] [b]',
      'allowed-tools': ['Bash', 'Read'],
      model: 'sonnet',
    })
  })
})

describe('parseFrontmatter on a block that is not valid YAML', () => {
  test('keeps name, description and argument-hint from their raw lines', () => {
    // `Use when: ...` is a second mapping on one line, which YAML refuses.
    const fm = parseFrontmatter(
      skill(
        'name: review\ndescription: Use when: a PR needs review\nargument-hint: [pr]\nmodel: x',
      ),
    )
    expect(fm).toEqual({
      name: 'review',
      description: 'Use when: a PR needs review',
      'argument-hint': '[pr]',
    })
  })

  test('strips matching quotes, keeps the first of a repeated key, and reads block scalars', () => {
    const fm = parseFrontmatter(
      skill(
        `name: "quoted"\nname: second\nbad: [unclosed\ndescription: >\n  Folded\n  text.\nargument-hint: |\n  one\n  two`,
      ),
    )
    expect(fm).toEqual({ name: 'quoted', description: 'Folded text.', 'argument-hint': 'one\ntwo' })
  })

  test('gives {} when none of the three keys is there', () => {
    expect(parseFrontmatter(skill('bad: [unclosed'))).toEqual({})
  })
})

describe('project mode lists the skills a repository ships', () => {
  test('Claude Code, Codex and Cursor skills, each with name, description, hint, origin and path', async () => {
    fx.write(fx.project, {
      '.claude/skills/review/SKILL.md': skill(
        'name: review\ndescription: Review a PR.\nargument-hint: "[pr-number] [--mode auto|ask]"',
      ),
      '.claude/skills/plain/SKILL.md': skill('description: No hint.'),
      '.agents/skills/ship/SKILL.md': skill('description: Ship it.\nargument-hint: [version]'),
      '.cursor/skills/lint/SKILL.md': skill('description: Lint.\nargument-hint: <path>'),
    })
    // A user skill is outside the project, so project mode does not read it.
    fx.write(fx.home, { '.claude/skills/mine/SKILL.md': skill('description: Mine.') })

    const options = { mode: 'project' as const }
    const claude = await fx.report('claude', options)
    const byName = Object.fromEntries(claude.skills.map((s) => [s.name, s]))
    expect(Object.keys(byName).sort()).toEqual(['plain', 'review'])
    expect(byName['review']).toMatchObject({
      name: 'review',
      description: 'Review a PR.',
      argumentHint: '[pr-number] [--mode auto|ask]',
      origin: 'project',
      scope: 'project',
      path: join(fx.project, '.claude', 'skills', 'review', 'SKILL.md'),
      body: null,
    })
    expect(byName['plain']!.argumentHint).toBeNull()

    const codex = await fx.report('codex', options)
    expect(codex.skills).toEqual([
      expect.objectContaining({
        name: 'ship',
        description: 'Ship it.',
        argumentHint: '[version]',
        origin: 'project',
        path: join(fx.project, '.agents', 'skills', 'ship', 'SKILL.md'),
      }),
    ])

    const cursor = await fx.report('cursor', options)
    expect(cursor.skills).toEqual([
      expect.objectContaining({ name: 'lint', argumentHint: '<path>', origin: 'project' }),
    ])
  })

  test('commands carry the hint too', async () => {
    fx.write(fx.project, {
      '.claude/commands/greet.md': skill('description: Say hello.\nargument-hint: <who>'),
    })
    const claude = await fx.report('claude', { mode: 'project' })
    expect(claude.commands).toEqual([
      expect.objectContaining({ name: 'greet', argumentHint: '<who>' }),
    ])
  })

  test('a multi-group hint keeps the name and description', async () => {
    fx.write(fx.project, {
      '.claude/skills/pick/SKILL.md': skill(
        'name: pick\ndescription: Pick a PR.\nargument-hint: [pr-number] [priority]',
      ),
    })
    const claude = await fx.report('claude', { mode: 'project' })
    expect(claude.skills).toEqual([
      expect.objectContaining({
        name: 'pick',
        description: 'Pick a PR.',
        argumentHint: '[pr-number] [priority]',
      }),
    ])
  })

  test('a skill whose front matter is not YAML still lists, with its raw name and description', async () => {
    fx.write(fx.project, {
      '.claude/skills/broken/SKILL.md': skill('description: Use when: it breaks\nbad: [unclosed'),
    })
    const claude = await fx.report('claude', { mode: 'project' })
    expect(claude.skills).toEqual([
      expect.objectContaining({
        name: 'broken',
        description: 'Use when: it breaks',
        argumentHint: null,
      }),
    ])
  })
})

describe('the plugin model reads the hint the same way', () => {
  test('an unquoted [list] hint keeps its brackets', () => {
    fx.write(fx.root, {
      'plugin/.claude-plugin/plugin.json': { name: 'p' },
      'plugin/skills/s/SKILL.md': skill('description: S.\nargument-hint: [message]'),
    })
    const model = readPlugin(join(fx.root, 'plugin'))
    expect(model.capabilities.find((c) => c.name === 's')?.argumentHint).toBe('[message]')
  })
})
