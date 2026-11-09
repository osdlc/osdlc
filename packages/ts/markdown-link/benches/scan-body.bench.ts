/**
 * Gated benchmarks for the body scanner on the shared synthetic corpus
 * (bench/README.md). The Rust twin, benches/body_links.rs, times the same
 * cases under the same names with `body_links_spanned`.
 */
import { test } from 'vitest'

import { corpus } from '../../../../bench/corpus/index.ts'
import { runCases } from '../../../../bench/suite.ts'
import { scanBodyWith } from '../src/index.ts'

const { bodies, largest, slow } = corpus()

test('scanBodyWith', ({ bench }) =>
  runCases(bench, {
    vault: () => {
      for (const body of bodies) scanBodyWith(body, {})
    },
    'largest-note': () => {
      scanBodyWith(largest, {})
    },
    ...Object.fromEntries(
      slow.map(({ name, body }) => [
        name,
        () => {
          scanBodyWith(body, {})
        },
      ]),
    ),
  }))
