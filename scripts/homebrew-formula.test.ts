// node --test scripts/homebrew-formula.test.ts
import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  className,
  compareVersions,
  formulaVersion,
  replaceDecision,
  urlCarriesVersion,
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
  name: 'skillwright',
  version: '0.3.5',
  desc: 'Publish markdown skill notes to coding-agent tools',
  homepage: 'https://github.com/osdlc/osdlc/tree/main/packages/rust/skillwright',
  license: 'MIT OR Apache-2.0',
  urlBase: 'https://github.com/osdlc/osdlc/releases/download/skillwright/v0.3.5',
  assets: [
    { os: 'darwin', cpu: 'arm64', file: 'skillwright-0.3.5-aarch64-apple-darwin', sha256: A },
    { os: 'darwin', cpu: 'x64', file: 'skillwright-0.3.5-x86_64-apple-darwin', sha256: B },
    { os: 'linux', cpu: 'arm64', file: 'skillwright-0.3.5-aarch64-unknown-linux-musl', sha256: C },
    { os: 'linux', cpu: 'x64', file: 'skillwright-0.3.5-x86_64-unknown-linux-musl', sha256: D },
  ],
}

test('the formula has a block per os and cpu, a license and a version test', () => {
  const rb = renderFormula(input)
  assert.match(rb, /^class Skillwright < Formula$/m)
  assert.match(rb, /^ {2}license any_of: \["MIT", "Apache-2.0"\]$/m)
  assert.match(
    rb,
    / {2}on_macos do\n {4}on_arm do\n {6}url "https:\/\/github.com\/osdlc\/osdlc\/releases\/download\/skillwright\/v0.3.5\/skillwright-0.3.5-aarch64-apple-darwin"\n {6}sha256 "a{64}"\n {4}end\n\n {4}on_intel do/,
  )
  assert.match(
    rb,
    / {2}on_linux do\n {4}on_arm do\n.*aarch64-unknown-linux-musl"\n {6}sha256 "c{64}"/,
  )
  assert.match(rb, /x86_64-unknown-linux-musl"\n {6}sha256 "d{64}"/)
  assert.ok(rb.includes('bin.install File.basename(stable.url) => "skillwright"'))
  assert.ok(rb.includes('assert_match version.to_s, shell_output("#{bin}/skillwright --version")'))
  assert.ok(rb.endsWith('end\n'))
})

test('no version line when every URL carries the version', () => {
  assert.doesNotMatch(renderFormula(input), /^\s*version /m)
  const plain = input.assets.map((a) => ({ ...a, file: a.file.replace('0.3.5-', '') }))
  const rb = renderFormula({ ...input, urlBase: 'https://example.com/dl', assets: plain })
  assert.match(rb, /^ {2}version "0.3.5"$/m)
})

test('the livecheck block reads the GitHub releases with the tag prefix', () => {
  const rb = renderFormula({
    ...input,
    livecheckTagPrefix: 'skillwright/v',
  })
  assert.ok(
    rb.includes(
      '  livecheck do\n    url :stable\n    regex(%r{^skillwright/v(\\d+(?:\\.\\d+)+)$}i)\n    strategy :github_releases\n  end',
    ),
  )
  assert.ok(!renderFormula(input).includes('livecheck'))
})

test('URLs that carry a version', () => {
  const base = 'https://github.com/osdlc/osdlc/releases/download/skillwright/v0.3.5'
  assert.ok(urlCarriesVersion(`${base}/skillwright-0.3.5-aarch64-apple-darwin`, '0.3.5'))
  assert.ok(urlCarriesVersion('https://x/archive/refs/tags/skillwright/v0.3.5.tar.gz', '0.3.5'))
  assert.ok(!urlCarriesVersion('https://x/dl/tool-aarch64', '0.3.5'))
  assert.ok(!urlCarriesVersion('https://x/dl/v10.3.55/tool', '0.3.5'))
})

test('a formula version comes from its version line or its first url', () => {
  const source = `class Skillwright < Formula
  url "https://github.com/osdlc/osdlc/archive/refs/tags/skillwright/v0.3.5.tar.gz"
end
`
  assert.equal(formulaVersion(source), '0.3.5')
  assert.equal(
    formulaVersion(renderFormula({ ...input, version: '0.3.6' }).replaceAll('0.3.5', '0.3.6')),
    '0.3.6',
  )
  assert.equal(
    formulaVersion('class X < Formula\n  version "1.2.3"\n  url "https://x/tool"\nend\n'),
    '1.2.3',
  )
  assert.equal(formulaVersion('class X < Formula\nend\n'), null)
})

test('versions compare numerically, a pre-release below its release', () => {
  assert.equal(compareVersions('0.3.10', '0.3.9'), 1)
  assert.equal(compareVersions('0.3.6', '0.3.6'), 0)
  assert.equal(compareVersions('0.4.0-rc.1', '0.4.0'), -1)
  assert.equal(compareVersions('0.4.0-rc.1', '0.3.9'), 1)
})

test('the tap never moves backwards and never takes a pre-release', () => {
  const at = (v: string) => renderFormula({ ...input, version: v }).replaceAll('0.3.5', v)
  assert.equal(replaceDecision(null, '0.3.6').replace, true)
  assert.equal(replaceDecision(at('0.3.5'), '0.3.6').replace, true)
  assert.equal(replaceDecision(at('0.3.6'), '0.3.6').replace, true)
  assert.equal(replaceDecision(at('0.4.0'), '0.3.6').replace, false)
  assert.equal(replaceDecision(at('0.3.5'), '0.4.0-rc.1').replace, false)
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
