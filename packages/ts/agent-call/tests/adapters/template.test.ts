import { describe, expect, test } from 'vitest'

import { callAgent } from '../../src/run.js'
import { templateAdapter, templateRefusal } from '../../src/adapters/template.js'

// A grok-style template: `grok -p {prompt} --model {model}`.
const GROK_ARGS = ['-p', '{prompt}', '--model', '{model}']
const grok = templateAdapter({ name: 'grok', binary: 'grok', args: GROK_ARGS, promptVia: 'argv' })

describe('templateAdapter', () => {
  test('fills each slot as one whole argument', () => {
    const planned = grok.plan({ prompt: '--not-a-flag "quoted"', model: 'grok-4' })
    expect(planned.argv).toEqual(['grok', '-p', '--not-a-flag "quoted"', '--model', 'grok-4'])
    expect(planned.stdin).toBeUndefined()
  })

  test('leaves an argument that only looks like a slot as written', () => {
    const odd = templateAdapter({
      name: 'odd',
      binary: 'odd',
      args: ['--tag', 'x{model}', '{prompt}'],
      promptVia: 'argv',
    })
    expect(odd.plan({ prompt: 'p' }).argv).toEqual(['odd', '--tag', 'x{model}', 'p'])
  })

  test('sends the prompt on stdin when the template says so', () => {
    const piped = templateAdapter({
      name: 'piped',
      binary: 'piped',
      args: ['--effort', '{effort}'],
      promptVia: 'stdin',
    })
    const planned = piped.plan({ prompt: 'hello', effort: 'high' })
    expect(planned.argv).toEqual(['piped', '--effort', 'high'])
    expect(planned.stdin).toBe('hello')
  })

  test('refuses a model or effort the slots cannot carry', () => {
    expect(templateRefusal(GROK_ARGS, { model: 'grok-4' })).toBeNull()
    expect(templateRefusal(GROK_ARGS, { model: 'grok-4', effort: 'high' })).toBe(
      "its headless template has no {effort} slot; cannot pass effort 'high'",
    )
    expect(templateRefusal(GROK_ARGS, {})).toBe(
      "its headless template's {model} slot needs a model, and none was resolved",
    )
    expect(() => grok.plan({ prompt: 'p' })).toThrow(/grok: .*\{model\} slot needs a model/)
  })

  test('runs end to end against a stand-in binary', async () => {
    const echo = templateAdapter({
      name: 'grok',
      binary: '/bin/echo',
      args: GROK_ARGS,
      promptVia: 'argv',
    })
    const result = await callAgent(echo, { prompt: 'hello grok', model: 'grok-4' })
    expect(result.ok).toBe(true)
    expect(result.text).toBe('-p hello grok --model grok-4')
  })
})
