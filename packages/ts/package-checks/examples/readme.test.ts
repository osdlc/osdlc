/**
 * The README's examples, run through the package name: the settings, the
 * shape checks as data, and the affected pick.
 */

import { expect, test } from 'vitest'

import { OSDLC, pick, readConfig, shapeRs, shapeTs } from '@osdlc/package-checks'

test('settings override osdlc rules', () => {
  const settings = readConfig({
    configPackages: ['tsconfig', 'prettier-config'],
    shared: ['^scripts/'],
  })
  expect(settings.license).toBe('MIT OR Apache-2.0')
  expect(settings.configPackages).toEqual(['tsconfig', 'prettier-config'])
})

test('the shape checks take data', () => {
  expect(shapeTs.authorProblems({ author: 'someone' })).toEqual([
    'author is "someone"; set "author": "sksizer"',
  ])
  expect(shapeTs.authorProblems({ author: 'someone' }, null)).toEqual([])
  expect(shapeRs.changelogProblems('# Changelog\n')).toEqual([])
})

test('a pull request picks the packages it changed and their dependents', () => {
  const manifests = new Map([
    ['packages/ts/lib', { name: '@acme/lib' }],
    ['packages/ts/app', { name: '@acme/app', dependencies: { '@acme/lib': 'workspace:^' } }],
  ])
  const files = ['packages/ts/lib/src/index.ts']
  expect(pick({ event: 'pull_request', files, manifests, settings: OSDLC })).toEqual([
    'packages/ts/app',
    'packages/ts/lib',
  ])
})
