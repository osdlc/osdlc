#!/usr/bin/env node
// The published entry point: `npx @osdlc/markdown-astro …` and a plain
// `node ./bin/markdown-astro.js …` both land here. Requires the built dist/
// (`pnpm run build`). See src/cli.ts.
import '../dist/cli.js'
