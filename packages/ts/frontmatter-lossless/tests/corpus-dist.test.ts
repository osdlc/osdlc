// Runs the family's conformance suite,
// packages/conformance/frontmatter-lossless/suite.json, against the built
// package. index.test.ts runs it against the TypeScript source; this one runs
// dist/, the code npm users get, through the same runner in conformance.ts.
// It imports `../dist/index.js`, so it needs the build, which the workspace
// runs before the tests (`pnpm -r build`, then `pnpm test`).

import * as lib from '../dist/index.js'
import { runSuite } from './conformance.ts'

runSuite(lib)
