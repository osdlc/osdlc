import type { ValidationFixture } from '../../harness.js'
import v01a from './01a-single-section-missing.js'
import v02 from './02-multiple-required-sequence.js'
import v02a from './02a-one-of-several-missing.js'
import v03 from './03-optional-sections.js'
import v03a from './03a-duplicate-section.js'
import v04 from './04-recognized-relative-order.js'
import v04a from './04a-recognized-relative-out-of-order.js'
import v05 from './05-strict-prefix-gap-tail.js'
import v05a from './05a-strict-prefix-violated.js'
import v05b from './05b-gap-bounds.js'
import v06 from './06-alias-sets-oneof.js'
import v06a from './06a-oneof-none-present.js'
import v06b from './06b-oneof-two-members-present.js'
import v07 from './07-frontmatter-only-zod.js'
import v07a from './07a-frontmatter-enum-and-unknown-key.js'
import v08 from './08-frontmatter-plus-body-one-pass.js'
import v08a from './08a-both-planes-fail-merged.js'
import v09 from './09-section-content-leaf-maxwords-anchor.js'
import v09a from './09a-maxwords-exceeded.js'
import v09b from './09b-anchor-missing.js'
import v10 from './10-table-leaf-columns-minrows.js'
import v10a from './10a-table-empty-and-minrows.js'
import v10b from './10b-table-missing-column.js'
import v10c from './10c-table-extra-column.js'
import v11 from './11-typed-cells-enum-pattern.js'
import v11a from './11a-cell-enum-violation.js'

export const partA: ValidationFixture[] = [
  v01a,
  v02,
  v02a,
  v03,
  v03a,
  v04,
  v04a,
  v05,
  v05a,
  v05b,
  v06,
  v06a,
  v06b,
  v07,
  v07a,
  v08,
  v08a,
  v09,
  v09a,
  v09b,
  v10,
  v10a,
  v10b,
  v10c,
  v11,
  v11a,
]
