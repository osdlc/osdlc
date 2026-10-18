/**
 * Need: configure only the tools that are installed, without running each
 * one to find out. Probing with `--version` is slow for some CLIs and has
 * side effects (update checks, telemetry) for others.
 *
 * `which(binary, opts?)` returns the path a spawn would run, or `undefined`.
 * It takes `env` like the runners, so a test points `PATH` at its own folder
 * instead of depending on what the machine has.
 */

import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, expect, test } from 'bun:test'

import { which, type WhichOptions } from '@osdlc/command-seam'

// ---- Code under test -------------------------------------------------------

const HARNESSES = ['codex', 'claude', 'cursor-agent'] as const

/** The harnesses installed on this machine, in a fixed order. */
function installedHarnesses(opts: WhichOptions = {}): string[] {
  return HARNESSES.filter((h) => which(h, opts) !== undefined)
}

// ---- Tests -----------------------------------------------------------------

const bin = realpathSync(mkdtempSync(join(tmpdir(), 'seam-which-example-')))
afterAll(() => rmSync(bin, { recursive: true, force: true }))

function install(name: string): string {
  const file = join(bin, name)
  writeFileSync(file, '#!/bin/sh\n')
  chmodSync(file, 0o755)
  return file
}

test('only the binaries on PATH are reported, and nothing is run', () => {
  install('claude')
  expect(installedHarnesses({ env: { PATH: bin } })).toEqual(['claude'])
})

test('which returns the absolute path a spawn would run', () => {
  const file = install('codex')
  expect(which('codex', { env: { PATH: bin } })).toBe(file)
  expect(which('cursor-agent', { env: { PATH: bin } })).toBeUndefined()
})
