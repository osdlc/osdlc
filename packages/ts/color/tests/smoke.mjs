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

import {
  colorDistance,
  compositeOver,
  contrastRatio,
  formatHex,
  fromPixel,
  mixColors,
  parseColor,
  relativeLuminance,
  withAlpha,
} from '@osdlc/color'

const white = parseColor('#ffffff')
assert.deepEqual(parseColor('rgb(300 0 0)'), { r: 255, g: 0, b: 0, a: 1 })
assert.deepEqual(parseColor('color(srgb 0.5 0.5 0.5 / 50%)'), {
  r: 127.5,
  g: 127.5,
  b: 127.5,
  a: 0.5,
})
assert.throws(() => parseColor('red'), Error)

assert.equal(formatHex(mixColors(white, parseColor('#1a73e8'), 0.25)), '#c6dcf9')
assert.throws(() => mixColors(white, white, Number.NaN), RangeError)
assert.deepEqual(withAlpha(parseColor('#1a73e8'), 0.5), { r: 26, g: 115, b: 232, a: 0.5 })
assert.deepEqual(fromPixel([0, 0, 0, 255]), { r: 0, g: 0, b: 0, a: 1 })

const painted = compositeOver(parseColor('rgba(0, 0, 0, 0.6)'), white)
assert.deepEqual(painted, { r: 102, g: 102, b: 102, a: 1 })
assert.throws(() => compositeOver(white, withAlpha(white, 0.5)), RangeError)

assert.equal(relativeLuminance(white), 1)
assert.equal(contrastRatio('#000000', '#ffffff'), 21)
assert.equal(colorDistance('#000000', 'rgb(3 4 0)'), 5)

console.log('color smoke: OK')
