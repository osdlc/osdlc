/**
 * `validateToolDef`: the shape check a host runs on a tool module it loads.
 */

import { describe, expect, test } from 'vitest'

import { builtins } from '../src/builtins.ts'
import { validateToolDef } from '../src/validate.ts'

describe('validateToolDef', () => {
  test('every built-in passes', () => {
    for (const tool of builtins) expect(validateToolDef(tool), tool.id).toEqual([])
  })

  test('a minimal tool passes', () => {
    expect(validateToolDef({ id: 'x', roles: {} })).toEqual([])
  })

  test('names each problem by its field', () => {
    expect(
      validateToolDef({
        id: '',
        homepage: 3,
        commandWords: ['a', 1],
        markers: [{ files: 'a' }, 'b'],
        ecosystem: { id: 'e' },
        roles: {
          runner: { kind: 'shell', invoke: 'x', probe: { timeoutMs: -1, cost: 'free' } },
          packageManager: { lockfiles: 'pnpm-lock.yaml' },
          hookManager: { configs: [] },
          toolManager: 'mise',
        },
      }),
    ).toEqual([
      'id is not a non-empty string',
      'homepage is not a string',
      'commandWords is not a list of strings',
      'markers[0].tier is not one of manifest, dependency, files, content',
      'markers[1].files is not a string',
      'ecosystem.manifests is not an array',
      'ecosystem.languages is not an array',
      'ecosystem.tools is not an array',
      'roles.packageManager.lockfiles is not a list of strings',
      'roles.packageManager.install is not a list of strings',
      'roles.runner.kind is not parse or exec',
      'roles.runner.collect is not a function',
      'roles.runner.invoke is not a function',
      'roles.runner.probe.timeoutMs is not a positive number',
      'roles.runner.probe.cost is not cheap or slow',
      'roles.toolManager is not an object',
      'roles.hookManager.arm is not a function',
    ])
  })

  test('a value that is not an object, or has no roles', () => {
    expect(validateToolDef(null)).toEqual(['the tool is not an object'])
    expect(validateToolDef([])).toEqual(['the tool is not an object'])
    expect(validateToolDef({ id: 'x' })).toEqual(['roles is not an object'])
  })
})

describe('brand', () => {
  test('checks the icon type and the color pattern the schema enforces', () => {
    expect(validateToolDef({ id: 'x', roles: {}, brand: { icon: 3, color: 'red' } })).toEqual([
      'brand.icon is not a string',
      'brand.color is not a #rrggbb color',
    ])
    expect(
      validateToolDef({
        id: 'x',
        roles: {
          runner: { kind: 'parse', collect() {}, brand: 'x', optionsEndAtTask: 'yes' },
        },
      }),
    ).toEqual([
      'roles.runner.brand is not an object',
      'roles.runner.optionsEndAtTask is not a boolean',
    ])
    expect(validateToolDef({ id: 'x', roles: {}, brand: { color: '#3776ab' } })).toEqual([])
  })
})
