#!/usr/bin/env node
// The published entry point: `npx @osdlc/code-stats …` and a plain
// `node ./bin/code-stats.js …` both land here. Requires the built dist/
// (`pnpm run build`). See src/cli/bin.ts.
import '../dist/cli/bin.js'
