#!/usr/bin/env node
// The published entry point: `npx @osdlc/corpus-schema …` and a plain
// `node ./bin/corpus-schema.js …` both land here. Requires the built dist/
// (`pnpm run build`). See src/cli.ts.
import '../dist/cli.js'
