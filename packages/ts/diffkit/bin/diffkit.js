#!/usr/bin/env node
// The published entry point: `npx @osdlc/diffkit prep …` and a plain
// `node ./bin/diffkit.js prep …` both land here. Requires the built dist/
// (`pnpm run build`). See src/bin.ts.
import '../dist/bin.js'
