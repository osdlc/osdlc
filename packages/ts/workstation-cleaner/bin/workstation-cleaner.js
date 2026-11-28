#!/usr/bin/env node
// The published entry point: `npx @osdlc/workstation-cleaner …` and a plain
// `node ./bin/workstation-cleaner.js …` both land here. Requires the built dist/
// (`pnpm run build`). See src/bin.ts.
import '../dist/bin.js'
