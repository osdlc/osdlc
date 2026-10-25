// Runs the built package under Node. The unit tests resolve the package name to
// the TypeScript source, so a broken emit could pass them and fail on the
// consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.ts copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  ansiColors,
  colors,
  cssSheet,
  detectColorLevel,
  displayWidth,
  fitWidth,
  nearestAnsi256,
  paint,
  stripControls,
  tokensCss,
} from '@osdlc/ux'

const css = readFileSync(fileURLToPath(import.meta.resolve('@osdlc/ux/tokens.css')), 'utf8')
assert.equal(css, tokensCss)
assert.ok(cssSheet({ prefix: 'd' }).includes(`--d-bg-base: ${colors.light['bg-base']};`))

assert.equal(detectColorLevel({ env: { TERM: 'xterm-256color' }, isTTY: true }), 'ansi256')
assert.equal(detectColorLevel({ env: { NO_COLOR: '1' }, isTTY: true }), 'none')
assert.equal(nearestAnsi256('#f7768e'), 210)
assert.equal(paint('x', ansiColors('ansi16', 'dark')['status-error']), '\x1b[31mx\x1b[39m')

assert.equal(stripControls('a\x1b]0;title\x07b\x9b2J'), 'ab')
assert.equal(displayWidth('日本é'), 5)
assert.equal(fitWidth('日本語', 5), '日本…')
assert.throws(() => fitWidth('x', -1), RangeError)

console.log('ux smoke: OK')
