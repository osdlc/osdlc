import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  CONFIG_ENV,
  clearConfigCache,
  configPath,
  configuredRepos,
  loadConfig,
} from '../src/config.ts'

const scratch = mkdtempSync(join(tmpdir(), 'repo-cleaner-config-'))

/** Write `body` as the config file and point the loader at it. */
function withConfig(body: string): void {
  const path = join(scratch, `config-${Math.random().toString(36).slice(2)}.yaml`)
  writeFileSync(path, body)
  process.env[CONFIG_ENV] = path
  clearConfigCache()
}

afterEach(() => {
  delete process.env[CONFIG_ENV]
  clearConfigCache()
})

describe('config', () => {
  test('the env var relocates the file; otherwise it is the tool config home', () => {
    delete process.env[CONFIG_ENV]
    expect(configPath()).toMatch(/repo-cleaner[/\\]config\.yaml$/)
    process.env[CONFIG_ENV] = '/x/elsewhere.yaml'
    expect(configPath()).toBe('/x/elsewhere.yaml')
  })

  test('reads repos and paths', () => {
    withConfig('paths:\n  dev: ~/Developer\nrepos:\n  - "{dev}"\n  - /srv/repos\n')
    expect(loadConfig().repos).toEqual(['{dev}', '/srv/repos'])
    expect(configuredRepos(loadConfig(), '/work')).toEqual([
      join(homedir(), 'Developer'),
      '/srv/repos',
    ])
  })

  test('a token nothing defines is an error, not an empty path', () => {
    withConfig('repos:\n  - "{dev}/api"\n')
    expect(() => configuredRepos(loadConfig(), '/work')).toThrow('{dev}')
  })

  test('a missing, malformed or wrong-shaped file degrades to no repositories', () => {
    process.env[CONFIG_ENV] = join(scratch, 'does-not-exist.yaml')
    clearConfigCache()
    expect(loadConfig().repos).toEqual([])

    withConfig('repos: [unclosed\n')
    expect(loadConfig().repos).toEqual([])

    withConfig('repos: 7\n')
    expect(loadConfig().repos).toEqual([])
  })
})

process.on('exit', () => rmSync(scratch, { recursive: true, force: true }))
