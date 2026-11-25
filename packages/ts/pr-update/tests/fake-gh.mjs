/**
 * A stand-in for `gh`, put on PATH by the clone tests (`tests/clone.test.ts`) so pr-update runs
 * it as the real program. It never reaches the network.
 *
 * - `FAKE_GH_ROOT` holds `<host>/<owner>/<name>.git` (a port's `:` as `_`), bare repositories that
 *   `repo clone <owner>/<name> <dir> ... -- --bare` clones from, on the host `GH_HOST` names, and
 *   `prs.json`, `{ "<owner>/<name>": [rows] }`, which `pr list --repo <owner>/<name>` prints.
 * - `FAKE_GH_LOG` is a file each call appends `{ "argv": [...], "host": "<GH_HOST>",
 *   "hooksPath": "<core.hooksPath from GIT_CONFIG_*, or null>" }` to, one JSON line each.
 * - `repo clone` takes only the real command's flags before `--`, and needs `-- --bare`.
 * - `auth git-credential get` answers with a fake token, as a credential helper.
 * - `FAKE_GH_FAIL_CLONE`, when set, makes `repo clone` fail with that message.
 * - `FAKE_GH_SQUAT`, when set, is a path `repo clone` fills with a file after cloning, as a run
 *   that ignored the lock would.
 * - `FAKE_GH_PUSH_URL`, when set, is the clone's `remote.origin.pushurl`, as an ssh URL stands for
 *   the origin real gh writes with `git_protocol: ssh`; fetches still read the local repository.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { spawnRunner } from '@osdlc/command-seam'

const argv = process.argv.slice(2)
const env = process.env
const host = env.GH_HOST ?? ''
/** The `core.hooksPath` the environment gives the git that gh runs, or null. */
const hooksPath = (() => {
  const count = Number(env.GIT_CONFIG_COUNT ?? 0)
  for (let i = 0; i < count; i++) {
    if (env[`GIT_CONFIG_KEY_${i}`] === 'core.hooksPath') return env[`GIT_CONFIG_VALUE_${i}`] ?? null
  }
  return null
})()
if (env.FAKE_GH_LOG) {
  appendFileSync(env.FAKE_GH_LOG, `${JSON.stringify({ argv, host, hooksPath })}\n`)
}

const root = env.FAKE_GH_ROOT ?? ''
const fail = (message) => {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

if (argv[0] === 'repo' && argv[1] === 'clone') {
  const [, , repo, dir] = argv
  // The flags of the real `gh repo clone` (gh 2.x), so an invented one fails here as it would there.
  const dashes = argv.indexOf('--')
  const own = argv.slice(4, dashes === -1 ? undefined : dashes)
  for (let i = 0; i < own.length; i++) {
    if (own[i] === '--no-upstream') continue
    if (own[i] === '-u' || own[i] === '--upstream-remote-name') {
      i++
      continue
    }
    fail(`unknown flag: ${own[i]}`)
  }
  if (dashes === -1 || !argv.slice(dashes + 1).includes('--bare')) {
    fail('fake gh clones only with -- --bare')
  }
  if (env.FAKE_GH_FAIL_CLONE) fail(env.FAKE_GH_FAIL_CLONE)
  const [owner, name] = repo.split('/')
  // A host's port, `ghe.example:8443`, is `ghe.example_8443` on disk: no `:` in a Windows path.
  const from = join(root, host.replaceAll(':', '_'), owner, `${name}.git`)
  if (!existsSync(from)) fail(`GraphQL: Could not resolve to a Repository with the name '${repo}'.`)
  const res = spawnRunner('git').run(['clone', '-q', '--bare', from, dir], { cwd: process.cwd() })
  process.stderr.write(res.stderr)
  if (res.exitCode !== 0) process.exit(res.exitCode)
  if (env.FAKE_GH_PUSH_URL) {
    spawnRunner('git').run(['-C', dir, 'config', 'remote.origin.pushurl', env.FAKE_GH_PUSH_URL], {
      cwd: process.cwd(),
    })
  }
  if (env.FAKE_GH_SQUAT) {
    mkdirSync(env.FAKE_GH_SQUAT, { recursive: true })
    writeFileSync(join(env.FAKE_GH_SQUAT, 'squatter'), 'not pr-update\n')
  }
  process.exit(0)
}

if (argv[0] === 'repo' && argv[1] === 'view') {
  process.stdout.write(`${JSON.stringify({ diskUsage: 2048 })}\n`)
  process.exit(0)
}

if (argv[0] === 'pr' && argv[1] === 'list') {
  const at = argv.indexOf('--repo')
  const repo = at === -1 ? '' : argv[at + 1]
  const file = join(root, 'prs.json')
  const prs = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  process.stdout.write(`${JSON.stringify(prs[repo] ?? [])}\n`)
  process.exit(0)
}

if (argv[0] === 'auth' && argv[1] === 'git-credential') {
  // A credential for `get`, as the real helper gives a signed-in user; nothing for the others.
  if (argv[2] === 'get') process.stdout.write('username=x-access-token\npassword=fake\n')
  process.exit(0)
}

fail(`fake gh does not know: gh ${argv.join(' ')}`)
