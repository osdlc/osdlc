/** The endpoint behind `data/`: every data file of the site, as `dataFiles` lists them. */
import type { APIRoute, GetStaticPaths } from 'astro'
import { getSite } from '../../context.ts'
import { dataFiles, type DataFile } from '../../data.ts'
import type { Site } from '../../site.ts'

const FILES = new WeakMap<Site, Map<string, DataFile>>()

function filesOf(site: Site): Map<string, DataFile> {
  let files = FILES.get(site)
  if (files === undefined) {
    files = new Map(dataFiles(site).map((file) => [file.path, file]))
    FILES.set(site, files)
  }
  return files
}

const TYPES: Record<string, string> = {
  json: 'application/json; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  yaml: 'text/yaml; charset=utf-8',
  yml: 'text/yaml; charset=utf-8',
  html: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
}

export const getStaticPaths: GetStaticPaths = () =>
  [...filesOf(getSite()).keys()].map((file) => ({ params: { file } }))

export const GET: APIRoute = ({ params }) => {
  const file = filesOf(getSite()).get(params['file'] ?? '')
  if (file === undefined) return new Response('Not found', { status: 404 })
  const extension = file.path.split('.').pop()?.toLowerCase() ?? ''
  return new Response(file.content() as BodyInit, {
    headers: { 'content-type': TYPES[extension] ?? 'application/octet-stream' },
  })
}
