import { describe, expect, test } from 'vitest'

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

  test('no packages key gives no globs', () => {
    expect(parsePnpmWorkspace('catalog:\n  react: ^19\n')).toEqual([])
  })
})
