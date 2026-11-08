/**
 * Gated benchmarks for `renderToHtml` on the shared synthetic corpus
 * (bench/README.md in the repository root, added by the benchmark harness
 * change). The wikilink and embed cases of the slow inputs are the ReDoS
 * payloads of tests/redos.test.ts.
 */
import { test } from 'vitest'

import { corpus, slowInputs } from '../../../../bench/corpus/index.ts'
import { runCases } from '../../../../bench/suite.ts'
import { renderToHtml } from '../src/index.ts'

const { bodies: allBodies, largest } = corpus()
// A full pass over the vault takes seconds, so each case times every sixth
// note, and the slow inputs run at a tenth of the corpus scale: a render does
// far more work per byte than a scan.
const bodies = allBodies.filter((_, i) => i % 6 === 0)
const slow = slowInputs(2_000)

test('renderToHtml', ({ bench }) =>
  runCases(bench, {
    vault: async () => {
      for (const body of bodies) await renderToHtml(body)
    },
    'largest-note': async () => {
      await renderToHtml(largest)
    },
    ...Object.fromEntries(
      slow.map(({ name, body }) => [
        name,
        async () => {
          await renderToHtml(body)
        },
      ]),
    ),
  }))
