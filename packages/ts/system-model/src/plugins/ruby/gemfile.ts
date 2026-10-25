/** The Gemfile parser behind the ruby ecosystem's `Gemfile` manifest. */

import type { DepFact, GemfileFact } from '../../manifests.ts'

/** `gem 'name'` lines. A gem inside a `group` block that names neither `:production` nor `:default` is `dev`. */
export function parseGemfile(text: string, path: string): GemfileFact {
  const deps: DepFact[] = []
  // One entry per open `group` block: whether it is a dev group. `devOpen`
  // counts the true entries, so a gem does not walk the stack.
  const groups: boolean[] = []
  let devOpen = 0
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    if (/^group\b/.test(line) && /\bdo\s*(?:\|[^|]*\|)?$/.test(line)) {
      const dev = !/:(production|default)\b/.test(line)
      groups.push(dev)
      if (dev) devOpen++
      continue
    }
    if (line === 'end' && groups.length > 0) {
      if (groups.pop()) devOpen--
      continue
    }
    const m = /^gem\s+['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?/.exec(line)
    if (m === null) continue
    const dev = devOpen > 0
    deps.push({
      name: m[1]!,
      kind: dev ? 'dev' : 'prod',
      specifier: m[2] ?? '',
      specifierKind: 'registry',
    })
  }
  return { manifestPath: path, ...(deps.length > 0 ? { deps } : {}) }
}
