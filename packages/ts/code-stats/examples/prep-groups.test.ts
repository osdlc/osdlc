/**
 * The grouping pieces under `runPrep`: find the package roots in a path list,
 * give each file its nearest root, and group kept files for reviewers.
 */
import { expect, test } from 'vitest'

import {
  PACKAGE_MARKERS,
  buildGroups,
  nearestRoot,
  packageRoots,
  type PrepFile,
} from '@osdlc/code-stats/prep'

const paths = ['package.json', 'crates/core/Cargo.toml', 'crates/core/src/lib.rs', 'web/app.vue']

test('a directory holding a manifest file is a package root', () => {
  expect(PACKAGE_MARKERS.has('Cargo.toml')).toBe(true)
  expect([...packageRoots(paths)].sort()).toEqual(['.', 'crates/core'])
})

test('a file takes the nearest root above it', () => {
  const roots = packageRoots(paths)
  expect(nearestRoot('crates/core/src/lib.rs', roots)).toBe('crates/core')
  expect(nearestRoot('web/app.vue', roots)).toBe('.')
})

test('kept files group by root, and a large group splits evenly', () => {
  const file = (path: string): PrepFile => ({
    path,
    status: 'modified',
    group: 'source',
    category: 'logic',
    language: null,
    added: 1,
    removed: 0,
  })
  const kept = ['a', 'b', 'c', 'd', 'e'].map((n) => file(`crates/core/src/${n}.rs`))
  const groups = buildGroups([...kept, file('web/app.vue')], packageRoots(paths), 4)
  // The repo root comes first. Five files over a limit of four are 3+2, not 4+1,
  // and the root's one file packs with the first slice.
  expect(groups.map((g) => g.files.length)).toEqual([4, 2])
  expect(groups[0]!.roots).toEqual(['.', 'crates/core'])
})
