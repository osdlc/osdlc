/**
 * The named-directories code the README shows, run. `tests/readme.test.ts`
 * checks that the README holds the `// #region` block word for word.
 */

import { expect, test } from 'vitest'

// #region named-directories
import { pathNames, substitutePathNames } from '@osdlc/config-layers'

const machinePaths = { dev: '~/Developer' }
const projectPaths = { docs: './docs' }
const names = pathNames('/work/app', machinePaths, projectPaths, { home: '/home/me' })
// { dev: '/home/me/Developer', docs: '/work/app/docs' }

const repo = substitutePathNames('{dev}/work', names, 'repos:')
// '/home/me/Developer/work'
// #endregion named-directories

test('the named directories snippet gives the values the README shows', () => {
  expect(names).toEqual({ dev: '/home/me/Developer', docs: '/work/app/docs' })
  expect(repo).toBe('/home/me/Developer/work')
  expect(() => substitutePathNames('{nope}', names, 'repos:')).toThrow(
    "unknown path name '{nope}' in repos: '{nope}'; define it under paths: (available: {docs}, {dev})",
  )
})
