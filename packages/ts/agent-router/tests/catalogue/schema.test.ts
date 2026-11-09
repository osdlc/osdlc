import { EFFORT_LEVELS } from '@osdlc/agent-call/models'
import { describe, expect, test } from 'vitest'
import { z } from 'zod'

import { headlessTemplateProblem, RouterConfigSchema } from '../../src/catalogue/schema.ts'
import { unknownEffortMessage } from '../../src/ref.ts'

const grok = (args: string[], prompt_via: 'argv' | 'stdin' = 'argv') => ({
  tools: { grok: { headless: { args, prompt_via } } },
})

describe('the headless template', () => {
  test('takes slots that are whole arguments', () => {
    expect(
      headlessTemplateProblem({
        args: ['-p', '{prompt}', '--model', '{model}'],
        prompt_via: 'argv',
      }),
    ).toBeNull()
    expect(
      headlessTemplateProblem({ args: ['--effort', '{effort}'], prompt_via: 'stdin' }),
    ).toBeNull()
    expect(RouterConfigSchema.safeParse(grok(['-p', '{prompt}'])).success).toBe(true)
  })

  test('refuses a slot inside a larger argument', () => {
    expect(
      headlessTemplateProblem({ args: ['--model={model}', '{prompt}'], prompt_via: 'argv' }),
    ).toBe("args[0]: {model} must be a whole argument, not part of '--model={model}'")
    const parsed = RouterConfigSchema.safeParse(grok(['-p', 'say {prompt}']))
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.message).toContain('{prompt} must be a whole argument')
  })

  test('needs {prompt} exactly when the prompt travels in the arguments', () => {
    expect(headlessTemplateProblem({ args: ['-p'], prompt_via: 'argv' })).toBe(
      'prompt_via: argv needs a {prompt} slot',
    )
    expect(headlessTemplateProblem({ args: ['{prompt}'], prompt_via: 'stdin' })).toBe(
      'prompt_via: stdin takes no {prompt} slot',
    )
    expect(
      headlessTemplateProblem({ args: ['{model}', '{model}', '{prompt}'], prompt_via: 'argv' }),
    ).toBe('{model} appears more than once')
  })
})

describe('a tool binary', () => {
  test('is not config: binary on a tool is an unknown key', () => {
    const parsed = RouterConfigSchema.safeParse({ tools: { claude: { binary: 'claude-work' } } })
    expect(parsed.error?.issues[0]?.message).toBe('Unrecognized key: "binary"')
  })
})

describe('efforts', () => {
  test('are words on the EFFORT_LEVELS scale, which a reference can name', () => {
    expect(
      RouterConfigSchema.safeParse({ tools: { pi: { efforts: ['none', 'high'] } } }).success,
    ).toBe(true)
    // pi's own word for `none`: a reference could never name it, so the config refuses it.
    const off = RouterConfigSchema.safeParse({ tools: { pi: { efforts: ['off', 'minimal'] } } })
    expect(off.success).toBe(false)
    expect(off.error?.issues[0]?.message).toBe(unknownEffortMessage('off'))
  })

  test('the generated JSON Schema lists the levels, for editors', () => {
    // A refine does not reach JSON Schema; the `meta` enum does.
    const json = JSON.stringify(z.toJSONSchema(RouterConfigSchema, { io: 'input' }))
    expect(json).toContain(
      JSON.stringify({ type: 'string', enum: [...EFFORT_LEVELS] }).slice(1, -1),
    )
  })
})
