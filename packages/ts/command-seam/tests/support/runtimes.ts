/**
 * The runtimes the probes run under. The suite runs on Node, so `NODE` is the
 * running binary. `BUN` is a `bun` on `PATH`, or undefined: the tests that
 * need Bun skip when it is absent, so Bun is optional for contributors.
 */

import { which } from '../../src/which.ts'

export const NODE = process.execPath

export const BUN: string | undefined = which('bun')
