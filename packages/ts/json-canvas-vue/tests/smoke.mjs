// Runs the built package under Node. The unit tests resolve the package name to
// the source, so a broken build could pass them and fail on the consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. The package checks copy it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const entry = await import('@osdlc/json-canvas-vue')

// The components are compiled: each is an object with a render or setup function.
for (const name of ['JsonCanvas', 'CanvasNode', 'EditPanel']) {
  const component = entry[name]
  assert.equal(typeof component, 'object', `${name} is exported`)
  assert.ok(component.setup ?? component.render, `${name} is a compiled component`)
}

// The markdown seam works with no DOM: the plain-text renderer escapes HTML itself.
assert.equal(typeof entry.registerMarkdownRenderer, 'function')
assert.match(await entry.renderedMarkdown('<b>hi</b>'), /&lt;b&gt;hi&lt;\/b&gt;/)

// The core's helpers come through the same entry.
assert.equal(entry.isValidCanvas({ nodes: [], edges: [] }), true)
assert.equal(typeof entry.useCanvasOperations, 'function')

// The stylesheet is its own export and holds the theme variables.
const stylesheet = readFileSync(
  fileURLToPath(import.meta.resolve('@osdlc/json-canvas-vue/style.css')),
  'utf8',
)
assert.match(stylesheet, /--vjc-/)

console.log('json-canvas-vue smoke: OK')
