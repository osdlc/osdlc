#!/usr/bin/env node
// The published entry point: `npx @osdlc/rule-review …` and a plain
// `node ./bin/rule-review.js …` both land here. Requires the built dist/
// (`pnpm run build`). See src/bin.ts.
import '../dist/bin.js'
