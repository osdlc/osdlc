import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { satisfies } from 'semver'
import { expect, test } from 'vitest'

import { experimentalExports, root } from './experimental-exports.ts'

// The identifiers in backticks on the list items of the README's `## Stability` section.
function readmeExperimental(): Set<string> {
  const readme = readFileSync(join(root, 'README.md'), 'utf8')
  const section = /^## Stability\n([\s\S]*?)(?=^## )/m.exec(readme)?.[1]
  if (section === undefined) throw new Error('README.md has no "## Stability" section')
  const listed = new Set<string>()
  const items = section.split('\n').reduce<string[]>((acc, line) => {
    if (line.startsWith('- ')) acc.push(line)
    else if (acc.length > 0 && line.startsWith('  ')) acc[acc.length - 1] += ` ${line.trim()}`
    return acc
  }, [])
  for (const item of items) {
    for (const [, name] of item.matchAll(/`([A-Za-z_]\w*)`/g)) listed.add(name!)
  }
  return listed
}

test('the README Stability list is exactly the @experimental exports', () => {
  const documented = [...experimentalExports()].sort()
  expect(documented.length).toBeGreaterThan(0)
  expect([...readmeExperimental()].sort()).toEqual(documented)
})

// D-02: the optional config-layers peer is a range written by hand. A Changesets rewrite that
// drops a supported line would break hosts on it in a patch, so the Version Packages PR fails here.
test('the config-layers peer range still admits every line it was checked against', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    peerDependencies?: Record<string, string>
  }
  const range = manifest.peerDependencies?.['@osdlc/config-layers'] ?? ''
  // Checked by hand with the packed package: `./config` builds its sections on each.
  for (const version of ['0.8.0', '0.9.0', '0.10.0']) expect(satisfies(version, range)).toBe(true)
})
