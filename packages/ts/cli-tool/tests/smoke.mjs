// Runs the BUILT package under Node. The unit tests run the TypeScript source
// (vitest.config.ts aliases the package name to it), so dist/ is compiled but
// never run anywhere else. A broken emit passes every other check and fails on
// the consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.ts copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.
//
// Tests each entry point, because each is a separate file that can break on
// its own: the root (flag parsing, exit codes, a captured context), ./devlink
// (the tool spec and the PATH shim), and the command tree with its shared
// commands, which load zod. The http entry answers a call; the mcp entry
// loads only when its optional peer, the MCP SDK, is installed.

import { strict as assert } from 'node:assert'

import * as root from '@osdlc/cli-tool'
import * as devlink from '@osdlc/cli-tool/devlink'
import * as defineCliEntry from '@osdlc/cli-tool/define-cli'
import * as exitEntry from '@osdlc/cli-tool/exit'
import * as ioEntry from '@osdlc/cli-tool/io'
import * as promptEntry from '@osdlc/cli-tool/prompt'
import * as wrapEntry from '@osdlc/cli-tool/wrap'
import { defineApp } from '@osdlc/cli-tool/command'
import { configCommands } from '@osdlc/cli-tool/config-command'
import { guideCommand } from '@osdlc/cli-tool/guide'
import { runApp } from '@osdlc/cli-tool/testing'
import { trustCommand } from '@osdlc/cli-tool/trust-command'
import { createHttpApi } from '@osdlc/cli-tool/http'

const { captureContext, captureIo, defineCli, EXIT, isDomainExit } = root

assert.ok(Object.keys(root).length > 0, 'the root entry exports nothing')
assert.ok(Object.keys(devlink).length > 0, 'the ./devlink entry exports nothing')
// The per-module subpaths hold the same bindings as the root.
assert.equal(defineCliEntry.defineCli, root.defineCli)
assert.equal(exitEntry.EXIT, root.EXIT)
assert.equal(ioEntry.captureIo, root.captureIo)
assert.equal(promptEntry.askYesNo, root.askYesNo)
assert.equal(wrapEntry.wrapText, root.wrapText)

// A command tree answers help, --json and --version from the built files.
{
  const none = async () => ({ root: '/r', trusted: false, by: null, changed: false })
  const app = defineApp({
    name: 'tooly',
    version: '1.0.0',
    summary: 'a smoke test',
    commands: {
      config: configCommands({
        layers: ['project'],
        defaultLayer: 'project',
        list: async () => ({ settings: [{ key: 'a', value: 1, source: 'project' }] }),
        locations: async () => [],
        set: async () => ({ file: 'f', value: 1 }),
        unset: async () => ({ file: 'f', removed: false }),
      }),
      trust: trustCommand({ trust: none, untrust: none, show: none, list: async () => [] }),
      guide: guideCommand([{ id: 'start', title: 'Start', summary: 's', body: () => 'Hi.' }], {
        title: 'tooly guide',
      }),
    },
  })
  assert.equal((await runApp(app, ['--version'])).out, 'tooly 1.0.0\n')
  const got = await runApp(app, ['config', 'get', 'a', '--json'])
  assert.deepEqual(got.json(), {
    schemaVersion: 1,
    kind: 'config-get',
    key: 'a',
    value: 1,
    source: 'project',
  })
  assert.match((await runApp(app, ['help'])).out, /commands:\n {2}config/)
  assert.equal((await runApp(app, ['schema', '--json'])).exit, 0)

  const api = createHttpApi(app, { context: { cwd: '/r', env: {} } })
  const res = await api.fetch(
    new Request('http://127.0.0.1/commands/config/get', {
      method: 'POST',
      headers: {
        host: '127.0.0.1',
        authorization: `Bearer ${api.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ key: 'a' }),
    }),
  )
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), got.json())

  let mcp = null
  try {
    mcp = await import('@osdlc/cli-tool/mcp')
  } catch (err) {
    if (!String(err).includes('@modelcontextprotocol/sdk')) throw err
  }
  if (mcp !== null) assert.ok(mcp.mcpTools(app).some((t) => t.name === 'config_get'))
}

// Flags are declared once and parsed to typed values.
const cli = defineCli({
  name: 'tooly',
  summary: 'Say what can go away.',
  flags: {
    verbose: { kind: 'count', short: 'v', help: 'say more' },
    output: { kind: 'enum', choices: ['text', 'json'], default: 'text', help: 'report format' },
  },
  positionals: [{ name: 'path', variadic: true, help: 'a checkout' }],
})
const parsed = cli.parse(['-vv', '--output=json', '/repo'], captureIo())
assert.equal(parsed.status, 'ok')
assert.equal(parsed.values.verbose, 2)
assert.equal(parsed.values.output, 'json')
assert.deepEqual(parsed.positionals, ['/repo'])

// A usage error comes back as a value and writes nothing.
const io = captureIo()
assert.equal(cli.parse(['--output', 'xml'], io).status, 'error')
assert.equal(io.out + io.err, '')

assert.deepEqual([EXIT.ok, EXIT.error, EXIT.usage], [0, 1, 2])
assert.equal(isDomainExit(EXIT.usage), false)

// A main function runs against a captured context.
const ctx = captureContext({ cwd: '/work', env: {} })
ctx.io.stdout('hello\n')
assert.equal(ctx.io.out, 'hello\n')

// devlink: the spec names the env variables and PATH names, and the shim
// execs the launcher it was rendered for.
const spec = devlink.validateSpec({
  name: 'tooly',
  marker: 'src/cli.ts',
  launcher: 'bin/tooly',
  aliases: ['ty'],
  vendorDirs: { vendor: 'com.example', envVars: root.envVars('TOOLY') },
})
assert.equal(devlink.envStem(spec), 'TOOLY')
assert.equal(devlink.homeVar(spec), 'TOOLY_HOME')
assert.deepEqual(devlink.pathNames(spec), ['tooly', 'ty'])
assert.equal(devlink.entryOf(spec), 'src/cli.ts')
assert.throws(() => devlink.validateSpec({ ...spec, marker: '/abs' }), /marker/)
const shim = devlink.renderShim(spec, '/checkout/bin/tooly')
assert.match(shim, /^#!\/bin\/sh/)
assert.ok(shim.includes('exec "$target" "$@"'))

// A classified failure is one line and a category exit code, from the shared table.
const failCtx = captureContext()
const code = root.failWith(
  failCtx,
  { kind: 'not-installed', message: '`gh` is not installed or not on PATH.', hint: 'Install it.' },
  { name: 'tooly' },
)
assert.equal(code, root.EXIT_FAILURE.missingTool)
assert.equal(code, 22)
assert.equal(failCtx.io.err, 'tooly: `gh` is not installed or not on PATH. Install it.\n')

console.log('cli-tool smoke: OK')
