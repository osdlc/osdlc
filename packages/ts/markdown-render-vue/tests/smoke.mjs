// Runs the built package under Node. The unit tests resolve the package name to
// the TypeScript source, so a broken emit could pass them and fail on the
// consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.ts copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

// Loads the built package the way a consumer does, through its `exports` map.
import assert from 'node:assert/strict'

const { MarkdownRender, defaultComponents, provideNoteSource } =
  await import('@osdlc/markdown-render-vue')

assert.ok(MarkdownRender)
assert.equal(typeof defaultComponents, 'function')
assert.equal(typeof provideNoteSource, 'function')

console.log('markdown-render-vue smoke: OK')
