// Barrel of validation fixtures, in numeric order.
// v01 is the worked sample; the rest are in two parts (01a–11, 12–21b). The declarative
// text-constraint fixtures sit beside their peers here. v27–v28 are the mcVersion 2 parity
// fixtures: description→hint and minContains/maxContains. v29–v38 pin a second H1,
// repeated-section content, frontmatter YAML errors and lines, structure and leaf hints, a
// null-first type union, and code-block values and lines.
import type { ValidationFixture } from '../../harness.js'
import { partA } from './_part-a.js'
import { partB } from './_part-b.js'
import v01 from './01-single-required-section.js'
import v22 from './22-text-requires-section.js'
import v23 from './23-text-forbids-body-root.js'
import v24 from './24-text-requires-count.js'
import v25 from './25-text-regex.js'
import v26 from './26-in-doc-dead-anchor.js'
import v27 from './27-v2-description-hint.js'
import v28 from './28-v2-min-max-contains.js'
import v29 from './29-second-h1.js'
import v30 from './30-repeated-section-content.js'
import v31 from './31-frontmatter-yaml-error.js'
import v32 from './32-frontmatter-line-after-wrapped-value.js'
import v33 from './33-structure-hints.js'
import v34 from './34-strict-order-and-gap-hints.js'
import v35 from './35-leaf-hints.js'
import v36 from './36-null-first-type-union.js'
import v37 from './37-code-block-value.js'
import v38 from './38-body-text-rule-hint.js'
import v39 from './39-strict-order-unknown-sections.js'

export const validationFixtures: ValidationFixture[] = [
  v01,
  ...partA,
  ...partB,
  v22,
  v23,
  v24,
  v25,
  v26,
  v27,
  v28,
  v29,
  v30,
  v31,
  v32,
  v33,
  v34,
  v35,
  v36,
  v37,
  v38,
  v39,
]
