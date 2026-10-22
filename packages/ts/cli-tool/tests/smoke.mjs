// Runs the BUILT package under Node. The unit tests run the TypeScript source
// (vitest.config.ts aliases the package name to it), so dist/ is compiled but
// never run anywhere else. A broken emit passes every other check and fails on
// the consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.mjs copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.
//
// Exercises both entry points, because each is a separate file that can break
// on its own: the root (flag parsing, exit codes, a captured context) and
// ./devlink (the tool spec and the PATH shim).

import { strict as assert } from 'node:assert'

import * as root from '@osdlc/cli-tool'
import * as devlink from '@osdlc/cli-tool/devlink'

const { captureContext, captureIo, defineCli, EXIT, isDomainExit } = root

assert.ok(Object.keys(root).length > 0, 'the root entry exports nothing')
assert.ok(Object.keys(devlink).length > 0, 'the ./devlink entry exports nothing')

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
