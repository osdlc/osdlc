// Runs the BUILT package under Node. The unit tests run the TypeScript source
// (vitest.config.ts aliases the package name to it), so a broken emit could
// pass them and fail on the consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.mjs copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'

import { compose, split, splitLenient } from '@osdlc/frontmatter-lossless'

const note = '\uFEFF---\r\ntitle: A\r\n---\r\nbody\r\n'
const parts = split(note)
assert.equal(parts.yaml, 'title: A\r')
assert.equal(parts.body, 'body\r\n')
assert.equal(parts.shape.bom, true)
assert.equal(note.slice(parts.yamlRange.start, parts.yamlRange.end), parts.yaml)
assert.equal(note.slice(parts.bodyStart), parts.body)
assert.equal(compose(parts.yaml, parts.body, parts.shape), note)
assert.equal(
  compose('title: B\r', parts.body, parts.shape),
  '\uFEFF---\r\ntitle: B\r\n---\r\nbody\r\n',
)

assert.equal(split('---\nno closing fence\n').yaml, null)
assert.deepEqual(splitLenient('\n---  \ntitle: A\n---\nbody\n'), {
  yaml: 'title: A',
  body: 'body\n',
})
assert.equal(splitLenient('no block\n'), null)

console.log('frontmatter-lossless smoke: OK')
