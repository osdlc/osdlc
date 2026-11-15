import { describe, expect, test } from 'vitest'

import { profilesSection, routerSection, routingSection } from '../../src/config/index.ts'

const consumers = ['host/route.ts#routeFor']
const vocabulary = {
  stage: ['build'],
  complexity: ['small'],
  impact: ['high'],
  autonomy: ['supervised'],
}
const profiles = profilesSection({ hostNames: ['tmux'], consumers })
const routing = routingSection(vocabulary, { consumers })
const router = routerSection({ consumers })

const accepts = (
  section: { schema: { safeParse(v: unknown): { success: boolean } } },
  v: unknown,
) => section.schema.safeParse(v).success

describe('config sections are strict', () => {
  test('profiles: unknown key inside an entry; a record has no fixed top level', () => {
    expect(accepts(profiles, { fast: { order: ['claude/opus'] } })).toBe(true)
    expect(accepts(profiles, { fast: { order: ['claude/opus'], bogus: 1 } })).toBe(false)
  })

  test('profiles: host outside the names the host supplies', () => {
    expect(accepts(profiles, { p: { order: ['claude/opus'], host: 'nope' } })).toBe(false)
    expect(accepts(profiles, { p: { order: ['claude/opus'], host: 'tmux' } })).toBe(true)
  })

  test('routing: unknown key on a rule and inside when', () => {
    expect(accepts(routing, [{ when: { workflow: 'x' }, profile: 'small' }])).toBe(true)
    expect(accepts(routing, [{ when: { workflow: 'x' }, profile: 'small', bogus: 1 }])).toBe(false)
    expect(accepts(routing, [{ when: { bogus: 'x' }, profile: 'small' }])).toBe(false)
  })

  test('routing: when value outside the supplied vocabulary', () => {
    expect(accepts(routing, [{ when: { complexity: 'huge' }, profile: 'small' }])).toBe(false)
    expect(accepts(routing, [{ when: { complexity: 'small' }, profile: 'small' }])).toBe(true)
  })

  test('router: unknown key at the top and inside a provider', () => {
    expect(accepts(router, { strict: true })).toBe(true)
    expect(accepts(router, { bogus: 1 })).toBe(false)
    expect(
      accepts(router, {
        providers: { p: { kind: 'anthropic', endpoint: 'https://x.test', bogus: 1 } },
      }),
    ).toBe(false)
  })
})

describe('config section metadata', () => {
  test('the moved sections are project and local layers only', () => {
    for (const section of [profiles, routing, router]) {
      expect(section.meta.layers).toEqual(['project', 'local'])
    }
  })

  test('the host-supplied consumers appear in meta, and nothing else does', () => {
    for (const section of [profiles, routing, router]) {
      expect(section.meta.consumers).toEqual(consumers)
    }
  })

  test('routing: the default description embeds the supplied vocabulary', () => {
    const description = routing.schema.description ?? ''
    expect(description).toContain('`stage` (build)')
    expect(description).toContain('`complexity` (small)')
    expect(description).toContain('`impact` (high)')
    expect(description).toContain('`autonomy` (supervised)')
  })

  test('routing: a host description replaces the default and receives the vocabulary', () => {
    const custom = routingSection(vocabulary, {
      consumers,
      describe: (v) => `custom ${v.stage.join(',')}`,
    })
    expect(custom.schema.description).toBe('custom build')
  })

  test('profiles and router: a host description replaces the default', () => {
    expect(profilesSection({ hostNames: [], consumers, description: 'p' }).schema.description).toBe(
      'p',
    )
    expect(routerSection({ consumers, description: 'r' }).schema.description).toBe('r')
  })

  test('router: stability is carried on the section meta, absent by default', () => {
    expect(routerSection({ consumers }).meta.stability).toBeUndefined()
    expect(routerSection({ consumers, stability: 'experimental' }).meta.stability).toBe(
      'experimental',
    )
  })
})

/** An object with an own `__proto__` key, as `JSON.parse` and a YAML load make one. */
const proto = (value: unknown): Record<string, unknown> =>
  JSON.parse(`{"__proto__": ${JSON.stringify(value)}}`) as Record<string, unknown>

describe('a __proto__ key is refused, not dropped', () => {
  test('profiles', () => {
    expect(accepts(profiles, proto(['claude/max']))).toBe(false)
    expect(accepts(profiles, { ...proto(42), ok: ['claude'] })).toBe(false)
  })

  test('router: tools, providers, a tool alias, pins and a classify rule family', () => {
    expect(accepts(router, { tools: proto({ bogus: 1 }) })).toBe(false)
    expect(accepts(router, { providers: proto({ kind: 'openai' }) })).toBe(false)
    expect(
      accepts(router, { tools: { claude: { aliases: proto('anthropic/claude-opus-5-5') } } }),
    ).toBe(false)
    expect(accepts(router, { pins: proto('opus') })).toBe(false)
    expect(accepts(router, { classify: [{ families: proto('max') }] })).toBe(false)
  })

  test('routing: a rule and its when are strict objects already', () => {
    expect(accepts(routing, [{ ...proto('x'), when: {}, profile: 'small' }])).toBe(false)
    expect(accepts(routing, [{ when: proto('x'), profile: 'small' }])).toBe(false)
  })
})

describe('router pins and via', () => {
  test.each(['--dangerously-skip-permissions', '-x y', 'opus\u200b', 'op\u0000us'])(
    'a pin value %j is refused',
    (pin) => {
      expect(accepts(router, { pins: { 'claude/max': pin } })).toBe(false)
    },
  )

  test('a pin value with local-tag punctuation is accepted', () => {
    expect(accepts(router, { pins: { 'pi/fast': 'ollama/qwen3:4b' } })).toBe(true)
  })

  test('a blank via is refused', () => {
    expect(
      accepts(router, { tools: { pi: { serves: [{ provider: 'ollama', via: '   ' }] } } }),
    ).toBe(false)
    expect(accepts(router, { offerings: [{ tool: 'pi', model: 'ollama/x', via: ' ' }] })).toBe(
      false,
    )
  })
})

describe('the default profiles description', () => {
  test('says the section checks the shape and the host checks the catalogue', () => {
    const description = profiles.schema.description ?? ''
    expect(description).not.toContain('An unknown tool')
    expect(description).toContain("is the host's check")
  })
})
