/** The Gemfile parser behind the ruby ecosystem's `Gemfile` manifest. */

import type { DepFact, GemfileFact } from '../../manifests.ts'

/** `gem 'name'` lines. A gem inside a `group` block that names neither `:production` nor `:default` is `dev`. */
export function parseGemfile(text: string, path: string): GemfileFact {
  const deps: DepFact[] = []
  // One entry per open block: whether it is a dev `group`. Any other block
  // (`platforms … do`, `if …`) is a false entry, so its `end` does not close
  // the group around it. `devOpen` counts the true entries, so a gem does not
  // walk the stack.
  const groups: boolean[] = []
  let devOpen = 0
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    const opensBlock = /\bdo\s*(?:\|[^|]*\|)?$/.test(line)
    if (/^group\b/.test(line) && opensBlock) {
      const dev = !/:(production|default)\b/.test(line)
      groups.push(dev)
      if (dev) devOpen++
      continue
    }
    if (opensBlock || /^(?:if|unless|case|begin)\b/.test(line)) {
      groups.push(false)
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
