// Runs the built package under Node. The unit tests resolve the package name to
// the TypeScript source, so a broken emit could pass them and fail on the
// consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. `package-checks ts` copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { findRecords, parseFilter } from '@osdlc/corpus-query'
import { createApp } from '@osdlc/corpus-query/cli'
import { createMcpServer, mcpTools } from '@osdlc/corpus-query/mcp'
import { openCorpus, serveRest } from '@osdlc/corpus-query/node'
import { createRestHandler } from '@osdlc/corpus-query/rest'

assert.deepEqual(parseFilter('status=done'), [{ field: 'status', op: 'eq', value: 'done' }])
assert.equal(mcpTools().length, 8)
assert.equal(createApp().name, 'corpus-query')

const dir = mkdtempSync(join(tmpdir(), 'corpus-query-smoke-'))
const put = (rel, text) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), text)
}
try {
  put('notes.corpus-schema.md', '---\ncorpus-schema: 0\n---\n')
  put('notes/notes.schema.yaml', 'type: object\nrequired: [status]\n')
  put('notes/A.md', '---\nstatus: done\n---\nSee [B](B.md).\n')
  put('notes/B.md', '---\nstatus: open\n---\nA note about lighthouses.\n')

  const corpus = openCorpus(dir)
  assert.equal(corpus.describe().records, 2)
  assert.deepEqual(
    corpus.find({ where: 'status=open' }).records.map((r) => r.ref),
    ['notes/B'],
  )
  assert.equal(findRecords(corpus.model, { search: 'lighthouse' }).records[0].id, 'B')
  assert.equal(corpus.backlinks('notes/B')[0].from.ref, 'notes/A')

  const handle = createRestHandler(corpus.model)
  const types = await (await handle(new Request('http://localhost/types'))).json()
  assert.equal(types[0].records, 2)
  const server = await serveRest(corpus.model)
  const got = await (await fetch(`${server.url}/records/notes/A`)).json()
  assert.equal(got.references[0].target.ref, 'notes/B')
  await server.close()
  await createMcpServer(corpus.model).close()

  // The bin, under node and, once installed, as npm links it in node_modules/.bin.
  const bin = join(
    dirname(fileURLToPath(import.meta.resolve('@osdlc/corpus-query'))),
    '..',
    'bin',
    'corpus-query.js',
  )
  const runs = [[process.execPath, [bin]]]
  const installed = join(process.cwd(), 'node_modules', '.bin', 'corpus-query')
  if (existsSync(installed)) runs.push([installed, []])
  for (const [command, prefix] of runs) {
    const ok = spawnSync(command, [...prefix, 'find', 'notes', 'status=done', '--json'], {
      cwd: dir,
      encoding: 'utf8',
    })
    assert.equal(ok.status, 0, `${command} find: ${ok.stderr}`)
    assert.equal(JSON.parse(ok.stdout).records[0].ref, 'notes/A')
    const bad = spawnSync(command, [...prefix, 'find', 'nope'], { cwd: dir, encoding: 'utf8' })
    assert.equal(bad.status, 2, `${command} on an unknown type: ${bad.stderr}`)
    const version = spawnSync(command, [...prefix, '--version'], { cwd: dir, encoding: 'utf8' })
    assert.match(version.stdout, /^corpus-query \d/)
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log('corpus-query smoke: OK')
