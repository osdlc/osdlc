#!/usr/bin/env node
import { main } from './main.js'

const abort = new AbortController()
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.once(sig, () => abort.abort())

process.exitCode = await main(process.argv.slice(2), {
  stdout: (t) => process.stdout.write(t),
  stderr: (t) => process.stderr.write(t),
  cwd: process.cwd(),
  signal: abort.signal,
})
