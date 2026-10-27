// node --test scripts/homebrew-formula.test.ts
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  className,
  licenseLine,
  parseAssetFlag,
  parseSums,
  renderFormula,
  rubyString,
  type FormulaInput,
} from './homebrew-formula.ts'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)
const C = 'c'.repeat(64)
const D = 'd'.repeat(64)

const input: FormulaInput = {
  name: 'tradecraft',
  version: '0.3.5',
  desc: 'Publish markdown skill notes to coding-agent tools',
  homepage: 'https://github.com/osdlc/osdlc/tree/main/packages/rust/tradecraft',
  license: 'MIT OR Apache-2.0',
  urlBase: 'https://github.com/osdlc/osdlc/releases/download/tradecraft/v0.3.5',
  assets: [
    { os: 'darwin', cpu: 'arm64', file: 'tradecraft-0.3.5-aarch64-apple-darwin', sha256: A },
    { os: 'darwin', cpu: 'x64', file: 'tradecraft-0.3.5-x86_64-apple-darwin', sha256: B },
    { os: 'linux', cpu: 'arm64', file: 'tradecraft-0.3.5-aarch64-unknown-linux-musl', sha256: C },
    { os: 'linux', cpu: 'x64', file: 'tradecraft-0.3.5-x86_64-unknown-linux-musl', sha256: D },
  ],
}

test('the formula has a block per os and cpu, a license and a version test', () => {
  const rb = renderFormula(input)
  assert.match(rb, /^class Tradecraft < Formula$/m)
  assert.match(rb, /^ {2}license any_of: \["MIT", "Apache-2.0"\]$/m)
  assert.match(
    rb,
    / {2}on_macos do\n {4}on_arm do\n {6}url "https:\/\/github.com\/osdlc\/osdlc\/releases\/download\/tradecraft\/v0.3.5\/tradecraft-0.3.5-aarch64-apple-darwin"\n {6}sha256 "a{64}"\n {4}end\n\n {4}on_intel do/,
  )
  assert.match(
    rb,
    / {2}on_linux do\n {4}on_arm do\n.*aarch64-unknown-linux-musl"\n {6}sha256 "c{64}"/,
  )
  assert.match(rb, /x86_64-unknown-linux-musl"\n {6}sha256 "d{64}"/)
  assert.ok(rb.includes('bin.install File.basename(stable.url) => "tradecraft"'))
  assert.ok(rb.includes('assert_match version.to_s, shell_output("#{bin}/tradecraft --version")'))
  assert.ok(rb.endsWith('end\n'))
})

test('a platform with no asset gets no block', () => {
  const rb = renderFormula({ ...input, assets: input.assets.filter((a) => a.os === 'darwin') })
  assert.ok(!rb.includes('on_linux'))
})

test('the renderer refuses what brew audit would', () => {
  assert.throws(() => renderFormula({ ...input, desc: 'The tool.' }))
  assert.throws(() => renderFormula({ ...input, desc: 'x'.repeat(81) }))
  assert.throws(() => renderFormula({ ...input, assets: [input.assets[0]!, input.assets[0]!] }))
  assert.throws(() => renderFormula({ ...input, assets: [] }))
})

test('class names follow Homebrew', () => {
  assert.equal(className('repo-cleaner'), 'RepoCleaner')
  assert.throws(() => className('Bad_Name'))
})

test('license lines', () => {
  assert.equal(licenseLine('MIT'), 'license "MIT"')
  assert.equal(licenseLine('MIT AND Zlib'), 'license all_of: ["MIT", "Zlib"]')
  assert.throws(() => licenseLine('MIT OR (Apache-2.0 AND Zlib)'))
})

test('Ruby strings escape quotes and interpolation', () => {
  assert.equal(rubyString('a "b" #{c} \\'), '"a \\"b\\" \\#{c} \\\\"')
})

test('SHA256SUMS lines parse, in text and binary mode', () => {
  const sums = parseSums(`${A}  one\n${B} *two\n\n`)
  assert.equal(sums.get('one'), A)
  assert.equal(sums.get('two'), B)
  assert.throws(() => parseSums('nope'))
})

test('--asset flags name a platform and a file', () => {
  assert.deepEqual(parseAssetFlag('linux-x64=t-1-x86_64'), {
    os: 'linux',
    cpu: 'x64',
    file: 't-1-x86_64',
  })
  assert.throws(() => parseAssetFlag('win32-x64=t.exe'))
})
