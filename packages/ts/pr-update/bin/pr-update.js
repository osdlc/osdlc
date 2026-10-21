#!/usr/bin/env node
// The published entry point: `npx @osdlc/pr-update …` and a plain
// `node ./bin/pr-update.js …` both land here. Requires the built dist/cli.js
// (`pnpm run build`).
import { runMain } from '@osdlc/cli-tool'
import { main } from '../dist/cli.js'

await runMain(main, { name: 'pr-update' })
