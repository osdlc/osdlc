// Runs the conformance corpus against the BUILT package under Node's own test
// runner. `bun test` covers the TypeScript source; this covers dist/, the code
// npm users get, on each Node line CI runs. It imports the package by name, so
// Node resolves it through `exports` to dist/: run `pnpm run build` first.
// The name has no `.test.` part, so `bun test` does not pick it up.

import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { compose, split, splitLenient } from '@osdlc/frontmatter-lossless'

const fixtures = JSON.parse(
  readFileSync(new URL('./fixtures/conformance.json', import.meta.url), 'utf8'),
)

test('the corpus is non-empty', () => {
  assert.ok(fixtures.length > 0)
})

for (const fx of fixtures) {
  test(`[${fx.name}] split, round trip, offsets and lenient`, () => {
    const s = split(fx.source)
    assert.equal(s.yaml, fx.split.yaml)
    assert.equal(s.body, fx.split.body)
    assert.deepEqual(
      { ...s.shape },
      {
        bom: fx.split.bom,
        openEol: fx.split.openEol,
        closeEol: fx.split.closeEol,
        closeSep: fx.split.closeSep,
      },
    )
    assert.equal(compose(s.yaml, s.body, s.shape), fx.source)
    if (s.yaml !== null) {
      assert.equal(fx.source.slice(s.yamlRange.start, s.yamlRange.end), s.yaml)
    }
    assert.equal(fx.source.slice(s.bodyStart), s.body)
    assert.deepEqual(splitLenient(fx.source), fx.lenient)
  })
}
