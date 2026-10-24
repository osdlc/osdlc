import { describe, expect, test, vi } from 'vitest'

import { parsePnpmWorkspace } from '../src/plugins/node/pnpm-workspace.ts'

describe('pnpm-workspace.yaml packages', () => {
  test('a block list, with quotes, comments and negations', () => {
    const text = [
      '# the workspace',
      'packages:',
      "  - 'apps/*'",
      '  - "packages/**" # every depth',
      '  - tools/cli',
      "  - '!**/test/**'",
      'catalog:',
      '  react: ^19',
      '',
    ].join('\n')
    expect(parsePnpmWorkspace(text)).toEqual(['apps/*', 'packages/**', 'tools/cli', '!**/test/**'])
  })

  test('a flow list', () => {
    expect(parsePnpmWorkspace('packages: [\'apps/*\', "libs/*"]\n')).toEqual(['apps/*', 'libs/*'])
  })

  test('a block list at the same indent as its key', () => {
    expect(parsePnpmWorkspace("packages:\n- 'packages/*'\n- apps/*\n")).toEqual([
      'packages/*',
      'apps/*',
    ])
  })

  test('a flow list over several lines', () => {
    expect(parsePnpmWorkspace("packages: [\n  'apps/*',\n  'libs/*',\n]\n")).toEqual([
      'apps/*',
      'libs/*',
    ])
  })

  test('no readable packages list means the members are unknown', () => {
    expect(parsePnpmWorkspace('catalog:\n  react: ^19\n')).toBeNull()
    expect(parsePnpmWorkspace('packages: []\n')).toBeNull()
    expect(parsePnpmWorkspace('packages: [\n')).toBeNull()
  })

  test('an unresolved tag emits no warning', () => {
    const spy = vi.spyOn(process, 'emitWarning')
    try {
      expect(parsePnpmWorkspace('packages: !custom\n')).toBeNull()
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})
