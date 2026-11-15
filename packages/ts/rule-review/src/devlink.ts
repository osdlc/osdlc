/**
 * The devlink spec: how `rule-review dev` recognises a rule-review checkout and runs it.
 *
 * A checkout has `src/cli.ts` and a `package.json` named `@osdlc/rule-review`; the
 * installed package ships no `src/`, so it never counts. A selected checkout
 * runs `src/bin.ts` under Bun. The cwd layer stays off: only `RULE_REVIEW_HOME`
 * or `rule-review dev link` hand off to a checkout.
 */

import { envVars } from '@osdlc/cli-tool'
import { validateSpec, type ToolSpec } from '@osdlc/cli-tool/devlink'

export const DEVLINK_SPEC: ToolSpec = validateSpec({
  name: 'rule-review',
  marker: 'src/cli.ts',
  packageName: '@osdlc/rule-review',
  entry: 'src/bin.ts',
  launcher: 'bin/rule-review.js',
  vendorDirs: { vendor: 'rule-review', envVars: envVars('RULE_REVIEW') },
})
