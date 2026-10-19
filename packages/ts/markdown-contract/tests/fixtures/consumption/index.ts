// Barrel of consumption fixtures, in numeric order.
// Add a new fixture: import its default below and append it to the array.
import type { ConsumptionFixture } from '../../harness.js'

import c01 from './01-read-the-model-door.js'
import c02 from './02-validate-doc-and-tree.js'
import c03 from './03-dual-key-section-access.js'
import c04 from './04-sectionview-content.js'
import c05 from './05-tableview-typed-rows.js'
import c06 from './06-named-tables-content-record.js'
import c07 from './07-byanchor-declared-vs-dynamic.js'
import c08 from './08-nested-subsections.js'
import c09 from './09-unknown-sections.js'
import c10 from './10-contracterror-door.js'
import c11 from './11-real-task-consumed.js'
import c12 from './12-typed-row-transform.js'
import c13 from './13-typed-list-items.js'
import c14 from './14-cell-position.js'
import c15 from './15-no-transform-parity.js'
import c16 from './16-typed-task-contract.js'

export const consumptionFixtures: ConsumptionFixture[] = [
  c01,
  c02,
  c03,
  c04,
  c05,
  c06,
  c07,
  c08,
  c09,
  c10,
  c11,
  c12,
  c13,
  c14,
  c15,
  c16,
]
