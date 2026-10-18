// Barrel of inference fixtures, in graded simple→complex order.
// Each NN-name/fixture.ts default-exports an InferenceFixture over its sibling vault/.
import type { InferenceFixture } from '../../harness.js'

import infer01 from './01-flat-uniform/fixture.js'
import infer02 from './02-optional-sections/fixture.js'
import infer03 from './03-order-recognized/fixture.js'
import infer04 from './04-order-strict/fixture.js'
import infer05 from './05-order-conflict/fixture.js'
import infer06 from './06-frontmatter-values/fixture.js'
import infer07 from './07-tree-depth1/fixture.js'
import infer08 from './08-tree-depth2/fixture.js'
import infer09 from './09-root-and-subdirs/fixture.js'
import infer10 from './10-stranded-depth/fixture.js'
import infer11 from './11-relax/fixture.js'

export const inferenceFixtures: InferenceFixture[] = [
  infer01,
  infer02,
  infer03,
  infer04,
  infer05,
  infer06,
  infer07,
  infer08,
  infer09,
  infer10,
  infer11,
]
