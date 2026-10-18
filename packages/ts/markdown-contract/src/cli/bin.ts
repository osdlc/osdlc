#!/usr/bin/env node
/**
 * The `markdown-contract` program. It runs `runCli` on the process arguments, writes its output
 * and exits with its code. Only this file calls `process.exit`. It runs whenever it is loaded,
 * so it does not depend on how it was started: directly, through a `node_modules/.bin` link, or
 * through `npx`.
 */
import { runCli } from './run.js'

const { code, stdout, stderr } = await runCli(process.argv.slice(2))
if (stdout) process.stdout.write(`${stdout}\n`)
if (stderr) process.stderr.write(`${stderr}\n`)
process.exit(code)
