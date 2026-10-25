/**
 * The README's library example. It imports only through the package name,
 * as a consumer does.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, expect, test } from 'vitest'

import {
  buildCatalog,
  filterSkills,
  filterTasks,
  groupOf,
  SessionError,
  terminalSafe,
  type CatalogDocument,
} from '@osdlc/wayfinder'
import { DOCUMENT_SCHEMAS, documentZod } from '@osdlc/wayfinder/schema'

const dirs: string[] = []
afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })))
})

async function repo(): Promise<{ dir: string; home: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'wayfinder-library-'))
  const home = await mkdtemp(join(tmpdir(), 'wayfinder-library-home-'))
  dirs.push(dir, home)
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'p', scripts: { build: 'tsc', dev: 'vite' } }),
  )
  await mkdir(join(dir, '.claude', 'skills', 'review'), { recursive: true })
  await writeFile(
    join(dir, '.claude', 'skills', 'review', 'SKILL.md'),
    '---\nname: review\ndescription: Review a pull request.\nargument-hint: [pr-number]\n---\n',
  )
  return { dir, home }
}

test('buildCatalog gives the catalog document, filtered like the CLI', async () => {
  const { dir, home } = await repo()
  const doc: CatalogDocument = await buildCatalog({ dir, env: {}, home })

  expect(doc).toMatchObject({ schemaVersion: 1, kind: 'catalog', root: dir })
  expect(DOCUMENT_SCHEMAS.catalog).toHaveProperty('properties.skills')

  const dev = filterTasks(doc.reports, { query: 'dev' }).map((h) => terminalSafe(h.task.display))
  expect(dev).toEqual(['npm run dev'])
  expect(groupOf(doc.reports[0]!.runner).id).toBe('tasks')

  expect(filterSkills(doc.skills, { query: 'pull' }).map((h) => h.skill.invoke)).toEqual([
    '/review',
  ])
  expect(doc.groups.map((g) => g.id)).toContain('skills')
  // The repository is not trusted, and no tool is trusted on its own.
  const trusted: string[] = doc.trustedTools
  expect(trusted).toEqual([])
})

test('buildCatalog takes the CLI filter, and refuses a directory that does not exist', async () => {
  const { dir, home } = await repo()
  const services = await buildCatalog({ dir, env: {}, home, filter: { servicesOnly: true } })
  expect(services.reports.flatMap((r) => r.tasks).map((t) => t.display)).toEqual(['npm run dev'])
  expect(services.skills).toEqual([])

  await expect(buildCatalog({ dir: join(dir, 'missing'), env: {}, home })).rejects.toBeInstanceOf(
    SessionError,
  )
})

test('documentZod parses a document, as the README shows', async () => {
  const { dir, home } = await repo()
  const output = JSON.stringify(await buildCatalog({ dir, env: {}, home }))
  const doc = documentZod('catalog').parse(JSON.parse(output))
  expect(doc).toMatchObject({ kind: 'catalog', root: dir })
  expect(DOCUMENT_SCHEMAS.trust).toHaveProperty('properties.kind.const', 'trust')
  expect(() => documentZod('catalog').parse({ kind: 'catalog' })).toThrow()
})
