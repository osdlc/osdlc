/**
 * The page builder's asset paths.
 *
 * `page.ts` derives three filesystem paths from `import.meta.url`. A `file:`
 * URL percent-encodes its path component, so deriving them with `.pathname`
 * hands the file reads and the bundler a literal `%20` for every space in the
 * install path, and every page load then fails with ENOENT. The install path is
 * the user's, not ours, so this is only reachable by staging a copy of the
 * package somewhere whose name contains a space.
 */
import { afterAll, expect, test } from 'vitest'
import { existsSync } from 'node:fs'
import { cp, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dirs: string[] = []
afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })))
})

const HERE = fileURLToPath(new URL('../', import.meta.url))

/**
 * The `node_modules` a real import from this package would resolve against.
 *
 * Found by walking up rather than assumed to be package-local: a hoisting
 * install layout puts it at the workspace root, and `symlink()` succeeds
 * against a target that does not exist — so guessing wrong fails the case at
 * its import with a resolution error, pointing at the wrong thing entirely.
 */
function nodeModules(): string {
  let at = HERE
  for (;;) {
    const candidate = join(at, 'node_modules')
    if (existsSync(join(candidate, '@osdlc', 'system-model'))) return candidate
    const up = dirname(at)
    if (up === at) throw new Error(`no node_modules with @osdlc/system-model above ${HERE}`)
    at = up
  }
}

test('builds the page when the install path contains a space', async () => {
  const base = await mkdtemp(join(tmpdir(), 'wayfinder-page-'))
  dirs.push(base)
  const install = join(base, 'My Projects')
  await cp(join(HERE, 'src'), join(install, 'src'), { recursive: true })
  await cp(join(HERE, 'scripts'), join(install, 'scripts'), { recursive: true })
  // The web entry imports @osdlc/system-model and the bundler is rolldown;
  // resolution walks up from the copy and finds this link.
  await symlink(nodeModules(), join(install, 'node_modules'))

  const { buildPage } = (await import(join(install, 'src', 'page.ts'))) as {
    buildPage(opts?: { theme?: string }): Promise<string>
  }
  const html = await buildPage({ theme: 'dark' })

  expect(html).toContain('<style>')
  expect(html).toContain('<html lang="en" data-theme="dark">')
  expect(html).toContain('--wf-bg-base')
  expect(html).not.toContain('@APP@')
  expect(html).not.toContain('@THEME@')
  expect(html).not.toContain('@STYLE@')
  expect(html).not.toContain('@SCRIPT@')
})
