/**
 * The named-directories code the README shows, run. `tests/readme.test.ts`
 * checks that the README holds the `// #region` block word for word.
 */

import { resolve } from 'node:path'

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

// The README shows POSIX paths; `resolve` gives the same paths in this platform's form.
test('the named directories snippet gives the values the README shows', () => {
  expect(names).toEqual({ dev: resolve('/home/me/Developer'), docs: resolve('/work/app/docs') })
  expect(repo).toBe(`${resolve('/home/me/Developer')}/work`)
  expect(() => substitutePathNames('{nope}', names, 'repos:')).toThrow(
    "unknown path name '{nope}' in repos: '{nope}'; define it under paths: (available: {docs}, {dev})",
  )
})
