#!/usr/bin/env node
// Writes src/version.generated.ts from the package.json in the current
// directory. See src/stamp-version.ts. Requires the built dist/.
import { stampVersionMain } from '../dist/stamp-version.js'

process.exitCode = stampVersionMain(process.argv.slice(2), process.cwd(), (line) =>
  process.stderr.write(`${line}\n`),
)
