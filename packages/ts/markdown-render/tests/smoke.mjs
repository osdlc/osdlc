// Runs the built package under Node. The unit tests resolve the package name to
// the TypeScript source, so a broken emit could pass them and fail on the
// consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.ts copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'

import { renderToHtml } from '@osdlc/markdown-render'
import { remarkWikilinks } from '@osdlc/markdown-render/plugins'
import { rehypeShiki } from '@osdlc/markdown-render/shiki'

const html = await renderToHtml('See [[Note|a *note*]] and ![[pic.png]].', {
  resolveLink: (target) => ({ kind: 'note', path: `/vault/${target}`, display: target }),
})
assert.match(html, /class="wikilink"/)
assert.match(html, /href="\/vault\/Note"/)
assert.match(html, /<markdown-embed/)
assert.equal(typeof remarkWikilinks, 'function')
assert.equal(typeof rehypeShiki, 'function')

console.log('markdown-render smoke: OK')
