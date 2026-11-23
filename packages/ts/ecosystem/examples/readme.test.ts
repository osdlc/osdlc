/**
 * The README's examples, through the package name, in a temporary home. Each
 * call adds the options that keep it there: `home`, an `env` with no osdlc
 * variables, and a resolver so ssh never runs.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { makeGitFixture } from '@osdlc/typed-git/testing'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { OSDLC_VENDOR_DIRS, osdlcDirs } from '@osdlc/ecosystem'
import {
  CheckoutLocator,
  REPOSITORIES_ENV,
  REPOSITORIES_FILE,
  defaultRoots,
  locateCheckout,
  parseRepoTarget,
  repositoriesFile,
  resolveRoots,
} from '@osdlc/ecosystem/repositories'

let home: string
let isolated: { home: string; env: Record<string, string>; resolveAlias: () => null }

beforeEach(() => {
  vi.stubEnv(REPOSITORIES_ENV, '')
  home = join(realpathSync(mkdtempSync(join(tmpdir(), 'ecosystem-example-'))), 'home')
  mkdirSync(home)
  isolated = { home, env: { HOME: home }, resolveAlias: () => null }
})
afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(join(home, '..'), { recursive: true, force: true })
})

/** `<home>/dev/<owner>/<name>`, with its origin on github.com. */
function checkout(owner: string, name: string): string {
  const fixture = makeGitFixture({ dir: join(home, 'dev', owner, name) })
  fixture.git.remoteAdd('origin', `git@github.com:${owner}/${name}.git`)
  return fixture.dir
}

test('quick start: one locator, many targets', () => {
  const caller = checkout('acme', 'app')
  const widgets = checkout('acme', 'widgets')
  const lines: string[] = []

  const locator = new CheckoutLocator({ caller, ...isolated })
  for (const target of ['acme/widgets', 'github.com/acme/gadgets']) {
    const found = locator.locate(target)
    if (found.length === 0) {
      const where = locator.roots.length === 0 ? 'no roots' : locator.roots.join(', ')
      lines.push(`${target}: no checkout under ${where}; roots are set in ${locator.file}`)
    }
    for (const c of found) lines.push(`${target}: ${c.path}`)
  }

  const file = join(osdlcDirs(isolated).standalone('osdlc').config().path, REPOSITORIES_FILE)
  expect(locator.source).toBe('default')
  expect(lines).toEqual([
    `acme/widgets: ${widgets}`,
    `github.com/acme/gadgets: no checkout under ${join(home, 'dev')}; roots are set in ${file}`,
  ])
})

test('writing roots, then reading them back', () => {
  const widgets = checkout('acme', 'widgets')

  const file = repositoriesFile(isolated)
  const current = file.read()
  file.writeRoots(['~/dev'], { etag: current?.etag ?? null })

  expect(resolveRoots(isolated)).toEqual({
    roots: [join(home, 'dev')],
    source: 'file',
    file: file.path(),
  })
  expect(locateCheckout(parseRepoTarget('acme/widgets'), isolated)).toEqual([
    { path: widgets, origin: { host: 'github.com', owner: 'acme', repo: 'widgets' } },
  ])
})

test('the default roots of an <owner>/<name> layout', () => {
  expect(defaultRoots({ caller: checkout('acme', 'app'), ...isolated })).toEqual([
    join(home, 'dev'),
  ])
  expect(OSDLC_VENDOR_DIRS.vendor).toBe('osdlc')
})
