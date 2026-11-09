/**
 * Gated benchmarks for `inlineTags` on the shared synthetic corpus
 * (bench/README.md), one test per dialect. The Rust twin, benches/inline_tags.rs,
 * times the same cases under the same names with `inline_tags`.
 */
import { test } from 'vitest'

import { corpus } from '../../../../bench/corpus/index.ts'
import { runCases } from '../../../../bench/suite.ts'
import { TAG_DIALECTS, inlineTags } from '../src/index.ts'

const { bodies, largest, slow } = corpus()

for (const dialect of TAG_DIALECTS) {
  test(`inlineTags ${dialect}`, ({ bench }) =>
    runCases(bench, {
      vault: () => {
        for (const body of bodies) inlineTags(body, dialect)
      },
      'largest-note': () => {
        inlineTags(largest, dialect)
      },
      ...Object.fromEntries(
        slow.map(({ name, body }) => [
          name,
          () => {
            inlineTags(body, dialect)
          },
        ]),
      ),
    }))
}
