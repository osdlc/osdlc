#!/usr/bin/env node
// The published entry point: `npx @osdlc/pr-update …` and a plain
// `node ./bin/pr-update.js …` both land here. Requires the built dist/
// (`pnpm run build`). See src/bin.ts.
import '../dist/bin.js'
