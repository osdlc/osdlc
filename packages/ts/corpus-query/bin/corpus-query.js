#!/usr/bin/env node
// The published entry point: `npx @osdlc/corpus-query …` and a plain
// `node ./bin/corpus-query.js …` both land here. Requires the built dist/
// (`pnpm run build`). See src/bin.ts.
import '../dist/bin.js'
