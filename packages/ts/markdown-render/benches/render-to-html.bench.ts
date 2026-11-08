/**
 * Gated benchmarks for `renderToHtml` on the shared synthetic corpus
 * (bench/README.md in the repository root, added by the benchmark harness
 * change). The wikilink and embed cases of the slow inputs are the ReDoS
 * payloads of tests/redos.test.ts.
 */
import { test } from 'vitest'

import { corpus } from '../../../../bench/corpus/index.ts'
import { runCases } from '../../../../bench/suite.ts'
import { renderToHtml } from '../src/index.ts'

const { bodies, largest, slow } = corpus()

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
