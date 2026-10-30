#!/usr/bin/env node
// Runs the native binary from the platform package npm installed alongside
// this one. dist.ts renders it from this template, filling in the
// placeholders below.
//
// It runs on the consumer's machine before any compiled binary is available,
// so it stays CommonJS and dependency-free.
'use strict'

const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const PLATFORM_PACKAGES = JSON.parse('{{platformPackages}}')
const BINARY = '{{binary}}'
const LAUNCHER = '{{launcher}}'
const DEBUG_ENV = '{{debugEnv}}'

function binaryPath() {
  const key = `${process.platform}-${process.arch}`
  const target = PLATFORM_PACKAGES[key]
  if (!target) {
    throw new Error(
      `${BINARY} has no build for ${key}. Supported: ${Object.keys(PLATFORM_PACKAGES).join(', ')}.`,
    )
  }
  const { package: pkg, binary: file } = target
  let bin
  try {
    // Through package.json: always resolvable, never blocked by an "exports" map.
    bin = path.join(path.dirname(require.resolve(`${pkg}/package.json`)), file)
  } catch {
    throw new Error(
      `${BINARY}: the platform package ${pkg} is not installed. ` +
        `It is an optional dependency of ${LAUNCHER}, so it is skipped when optional dependencies are ` +
        '(--omit=optional, --no-optional) or when the lockfile was made on another platform. ' +
        `Reinstall without those, or add ${pkg} directly.`,
    )
  }
  if (!fs.existsSync(bin)) {
    throw new Error(
      `${BINARY}: ${pkg} is installed but its binary ${bin} is missing; try reinstalling.`,
    )
  }
  return { bin, pkg }
}

let bin, pkg
try {
  ;({ bin, pkg } = binaryPath())
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
}

if (DEBUG_ENV && process.env[DEBUG_ENV]) {
  process.stderr.write(
    `${BINARY} launcher: platform=${process.platform}-${process.arch} package=${pkg} binary=${bin}\n`,
  )
}

// Inherited stdio, so the binary owns the terminal; exit code and signal pass through.
// A terminal's Ctrl-C reaches the child directly (same process group), so the
// launcher ignores SIGINT and waits for the child to exit; forwarding it would
// deliver it twice. SIGTERM and SIGHUP, usually sent to this pid alone, are
// forwarded.
const child = spawn(bin, process.argv.slice(2), { stdio: 'inherit', windowsHide: false })
process.on('SIGINT', () => {})
const forwarded = ['SIGTERM', ...(process.platform === 'win32' ? [] : ['SIGHUP'])]
for (const signal of forwarded) {
  process.on(signal, () => {
    try {
      child.kill(signal)
    } catch {
      // Child already gone; its exit handler finishes up.
    }
  })
}
child.on('error', (error) => {
  process.stderr.write(`${BINARY}: could not run ${bin}: ${error.message}\n`)
  process.exit(1)
})
child.on('exit', (code, signal) => {
  if (signal) {
    // Restore default handling so the re-raise ends this process like the child.
    process.removeAllListeners(signal)
    try {
      process.kill(process.pid, signal)
    } catch {
      // Not raisable here (Windows); fall through to the exit code.
    }
    // A signal Node ignores (SIGPIPE) leaves us running: exit the shell way.
    process.exit(128 + (os.constants.signals[signal] ?? 0))
  }
  process.exit(code ?? 1)
})
