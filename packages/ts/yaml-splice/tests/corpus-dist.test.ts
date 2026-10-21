// Runs the conformance corpus against the BUILT package under Node's own test
// runner. `bun test` covers the TypeScript source; this covers dist/ and its
// copy of the wasm, the code npm users get, on each Node line CI runs. It
// imports the package by name, so Node resolves it through `exports` to
// dist/, which the `test:node` script builds first.
// The name has no `.test.` part, so `bun test` does not pick it up.

import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { EditError, editYaml } from '@osdlc/yaml-splice'

// The corpus is the crate's; this suite reads it in place.
const fixtures = JSON.parse(
  readFileSync(
    new URL('../../../rust/yaml-splice/tests/fixtures/conformance.json', import.meta.url),
    'utf8',
  ),
)

const sourceBytes = (fx) =>
  fx.source !== undefined ? new TextEncoder().encode(fx.source) : Uint8Array.from(fx.source_bytes)

test('the corpus is non-empty', () => {
  assert.ok(fixtures.length > 0)
})

for (const fx of fixtures) {
  // The package has no case-sensitivity option; see tests/index.test.ts.
  test(fx.name, { skip: fx.case_sensitive === true }, () => {
    const source = sourceBytes(fx)
    if (fx.expect.error !== undefined) {
      assert.throws(
        () => editYaml(source, fx.edits),
        (err) => err instanceof EditError && err.code === fx.expect.error,
      )
      return
    }
    const out = editYaml(source, fx.edits)
    assert.equal(out.changed, fx.expect.changed)
    assert.equal(
      new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }).decode(out.bytes),
      fx.expect.bytes,
    )
  })
}
