import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

// The README example, run through the package name the way a consumer imports it.
import { ASSET_MANIFEST, loadConfig, transform } from '@osdlc/markdown-astro'

test('README: transform turns an image embed into a markdown image and copies the file', () => {
  const root = mkdtempSync(join(tmpdir(), 'markdown-astro-example-'))
  mkdirSync(join(root, 'vault/Posts'), { recursive: true })
  mkdirSync(join(root, 'vault/_attachments'), { recursive: true })
  writeFileSync(join(root, 'vault/_attachments/photo.png'), 'png')
  writeFileSync(join(root, 'vault/Posts/hello.md'), 'Hi ![[photo.png]] and [[Other Note]]\n')
  writeFileSync(
    join(root, 'markdown-astro.config.yaml'),
    [
      'vault: vault',
      'assets: { publicDir: public/_media, publicBase: /_media, vaultDir: _attachments }',
      'collections:',
      '  - { name: posts, vaultDir: Posts, contentDir: src/content/posts, route: /posts/:slug }',
      '',
    ].join('\n'),
  )

  const stats = transform(loadConfig(join(root, 'markdown-astro.config.yaml')), { verbose: false })

  expect(stats.files).toBe(1)
  expect(readFileSync(join(root, 'src/content/posts/hello.md'), 'utf8')).toBe(
    'Hi ![photo.png](/_media/photo.png) and [[Other Note]]\n',
  )
  expect(existsSync(join(root, 'public/_media/photo.png'))).toBe(true)
  expect(JSON.parse(readFileSync(join(root, ASSET_MANIFEST), 'utf8'))).toEqual({
    'photo.png': 'photo.png',
  })
})
