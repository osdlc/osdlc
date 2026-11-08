#!/usr/bin/env node
// The published entry point: `npx @osdlc/markdown-db …` and a plain
// `node ./bin/markdown-db.js …` both land here. Requires the built dist/
// (`pnpm run build`). See src/cli.ts.
import '../dist/cli.js'
