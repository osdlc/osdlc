/**
 * The skills a repository ships, as project mode reports them, and the
 * `argument-hint` field on each skill, command and agent.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { join } from 'node:path'

import { argumentHintOf } from '../src/frontmatter.ts'
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

  test('an unquoted [list] is written back with its brackets', () => {
    expect(argumentHintOf({ 'argument-hint': ['message'] })).toBe('[message]')
    expect(argumentHintOf({ 'argument-hint': ['a', 'b'] })).toBe('[a, b]')
  })

  test('unset, blank or empty is null', () => {
    expect(argumentHintOf({})).toBeNull()
    expect(argumentHintOf({ 'argument-hint': '   ' })).toBeNull()
    expect(argumentHintOf({ 'argument-hint': null })).toBeNull()
    expect(argumentHintOf({ 'argument-hint': [] })).toBeNull()
  })

  test('a scalar of another type is read as text', () => {
    expect(argumentHintOf({ 'argument-hint': 3 })).toBe('3')
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

  test('a skill whose front matter does not parse still lists, with no hint', async () => {
    fx.write(fx.project, {
      '.claude/skills/broken/SKILL.md': skill('argument-hint: [a] [b]'),
    })
    const claude = await fx.report('claude', { mode: 'project' })
    expect(claude.skills).toEqual([
      expect.objectContaining({ name: 'broken', description: null, argumentHint: null }),
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
