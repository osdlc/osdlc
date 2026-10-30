#!/usr/bin/env node
// The published entry point: `npx @osdlc/markdown-contract …` and a plain
// `node ./bin/markdown-contract.js …` both land here. Requires the built dist/
// (`pnpm run build`). See src/cli/bin.ts.
import '../dist/cli/bin.js'
