// Runs the BUILT package under Node. The unit tests resolve the package name to
// the TypeScript source, so a broken emit could pass them and fail on the
// consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.mjs copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { contract, runCorpus, section, sections } from '@osdlc/markdown-contract'
import { runCli } from '@osdlc/markdown-contract/cli'
import { parse } from '@osdlc/markdown-contract/core'
import { loadContract } from '@osdlc/markdown-contract/declarative'

const CONTRACT_YAML = 'mcVersion: 2\nkind: contract\nbody:\n  sections:\n    - section: Summary\n'

const tree = parse('# Title\n\n## Summary\n\nHello.\n')
assert.deepEqual(
  tree.root.sections.map((s) => s.name),
  ['Summary'],
)

const coded = contract({ body: sections({}, [section('Summary')]) })
assert.deepEqual(coded.validate('## Summary\n\nx\n', { path: 'a.md' }).findings, [])
assert.deepEqual(
  loadContract(CONTRACT_YAML)
    .validate('## Other\n\nx\n', { path: 'a.md' })
    .findings.map((f) => f.id),
  ['structure/section-missing'],
)

const dir = mkdtempSync(join(tmpdir(), 'markdown-contract-smoke-'))
try {
  const pass = join(dir, 'pass')
  const fail = join(dir, 'fail')
  for (const [folder, body] of [
    [pass, '## Summary\n\nx\n'],
    [fail, '## Other\n\nx\n'],
  ]) {
    mkdirSync(folder)
    writeFileSync(join(folder, 'markdown-contract.yaml'), CONTRACT_YAML)
    writeFileSync(join(folder, 'doc.md'), body)
  }

  assert.equal(
    runCorpus({ rules: [{ include: ['**/*.md'], contract: coded }] }, { cwd: pass }).exitCode,
    0,
  )
  assert.equal(
    (await runCli(['validate', '.', '--contract', 'markdown-contract.yaml'], { cwd: fail })).code,
    1,
  )

  // The bin, through a symlink: npm and npx start it from node_modules/.bin.
  // tsc does not set the execute bit, so a link to dist/ runs under node; the
  // link npm installs is executable and runs as a command.
  const bin = join(
    dirname(fileURLToPath(import.meta.resolve('@osdlc/markdown-contract/cli'))),
    'bin.js',
  )
  const link = join(dir, 'markdown-contract')
  symlinkSync(bin, link)
  const runs = [[process.execPath, [link]]]
  const installed = join(process.cwd(), 'node_modules', '.bin', 'markdown-contract')
  if (existsSync(installed)) runs.push([installed, []])

  for (const [command, prefix] of runs) {
    const args = [...prefix, 'validate', '.', '--contract', 'markdown-contract.yaml']
    const ok = spawnSync(command, args, { cwd: pass, encoding: 'utf8' })
    assert.equal(ok.status, 0, `${command} on a passing folder: ${ok.stderr}`)
    const bad = spawnSync(command, args, { cwd: fail, encoding: 'utf8' })
    assert.equal(bad.status, 1, `${command} on a failing folder: ${bad.stderr}`)
    assert.match(bad.stdout, /structure\/section-missing/)
  }

  // Output larger than a pipe buffer (64 KB) must arrive whole: the bin sets the exit code and
  // lets the streams drain, instead of calling process.exit.
  const many = join(dir, 'many')
  mkdirSync(many)
  writeFileSync(join(many, 'markdown-contract.yaml'), CONTRACT_YAML)
  const COUNT = 3000
  for (let i = 0; i < COUNT; i++) writeFileSync(join(many, `doc-${i}.md`), '## Other\n\nx\n')
  for (const [command, prefix] of runs) {
    const args = [...prefix, 'validate', '.', '--contract', 'markdown-contract.yaml']
    for (const format of ['json', 'sarif']) {
      const big = spawnSync(command, [...args, '--format', format], {
        cwd: many,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
      })
      assert.equal(big.status, 1, `${command} --format ${format}: ${big.stderr}`)
      assert.ok(big.stdout.length > 65536, `${format} output is larger than a pipe buffer`)
      const parsed = JSON.parse(big.stdout)
      const count = format === 'json' ? parsed.length : parsed.runs[0].results.length
      assert.equal(count, COUNT, `${command} --format ${format} was cut short`)
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}
