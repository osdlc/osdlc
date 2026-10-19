import type { ValidationFixture } from '../../harness.js'
import v12 from './12-list-leaf-checkbox-minitems.js'
import v12a from './12a-non-checkbox-list-item.js'
import v12b from './12b-list-below-minitems.js'
import v13 from './13-code-leaf-lang.js'
import v13a from './13a-code-wrong-lang.js'
import v14 from './14-nested-children-subsections.js'
import v14a from './14a-skipped-heading-level.js'
import v14b from './14b-content-before-first-subheading.js'
import v15 from './15-multiple-anchored-tables-one-section.js'
import v15a from './15a-declared-anchor-absent.js'
import v15b from './15b-undeclared-anchor-dynamic-access.js'
import v16 from './16-cross-plane-docrule.js'
import v16a from './16a-docrule-violation.js'
import v17 from './17-node-level-custom-rule.js'
import v17a from './17a-node-rule-violation-with-pos.js'
import v18 from './18-oom-consumption-typed-views.js'
import v18a from './18a-camelcase-key-collision.js'
import v18b from './18b-read-throws-on-error.js'
import v19 from './19-real-decision-contract-end-to-end.js'
import v19a from './19a-real-decision-three-findings.js'
import v19b from './19b-real-decision-alias-recommendation.js'
import v20 from './20-real-task-contract-end-to-end.js'
import v20a from './20a-real-task-closed-without-completion-note.js'
import v20b from './20b-real-task-non-checkbox-acs.js'
import v21 from './21-real-milestone-or-skill-doctype.js'
import v21a from './21a-table-inside-blockquote-or-list.js'
import v21b from './21b-fence-contains-heading-line.js'

export const partB: ValidationFixture[] = [
  v12,
  v12a,
  v12b,
  v13,
  v13a,
  v14,
  v14a,
  v14b,
  v15,
  v15a,
  v15b,
  v16,
  v16a,
  v17,
  v17a,
  v18,
  v18a,
  v18b,
  v19,
  v19a,
  v19b,
  v20,
  v20a,
  v20b,
  v21,
  v21a,
  v21b,
]
