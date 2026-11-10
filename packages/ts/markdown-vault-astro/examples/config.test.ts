import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

// The README examples, run through the package name the way a consumer imports it.
import { DEFAULT_CONFIG_NAME, loadConfig, resolveDefaultConfig } from '@osdlc/markdown-vault-astro'

function site(yaml: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'markdown-vault-astro-example-'))
  writeFileSync(join(dir, DEFAULT_CONFIG_NAME), yaml)
  return dir
}

test('README: the config file is markdown-vault-astro.config.yaml next to the site', () => {
  expect(DEFAULT_CONFIG_NAME).toBe('markdown-vault-astro.config.yaml')
  const dir = site('collections: []\n')
  expect(resolveDefaultConfig(dir)).toBe(join(dir, DEFAULT_CONFIG_NAME))
})

test('README: the vault is the option, else the file, else <astroRoot>/vault', () => {
  const collection =
    'collections:\n  - { name: posts, vaultDir: Posts, contentDir: src/content/posts }\n'
  const yaml = `astroRoot: .\nvault: notes-vault\n${collection}`
  const dir = site(yaml)
  const path = resolveDefaultConfig(dir)
  expect(loadConfig(path).vault).toBe(join(dir, 'notes-vault'))
  expect(loadConfig(path, { vault: join(dir, 'other') }).vault).toBe(join(dir, 'other'))
  expect(loadConfig(resolveDefaultConfig(site(collection))).vault).toMatch(/\/vault$/)
})
