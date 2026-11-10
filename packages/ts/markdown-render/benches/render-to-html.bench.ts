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
// The runner takes at least 64 samples of a case, and a render costs about a
// millisecond per 5 KiB, so each case is a sample: every sixtieth note of the
// vault, and the slow inputs at a fortieth of the corpus scale, limited to the
// ones that hold wikilinks or embeds (the markdown-link ones cost the same in
// the renderer as ordinary text).
const bodies = allBodies.filter((_, i) => i % 60 === 0)
const slow = slowInputs(500).filter(({ name }) => /wikilink|embed|unterminated/.test(name))

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
