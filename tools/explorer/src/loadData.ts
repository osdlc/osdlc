import { parseEcosystem, pickDataset, type LoadedData } from './model/data'

// Both files are bundled at build time. A glob, not a plain import, so a missing
// ecosystem.json is not an error; Vite also picks the file up when it appears during `pnpm dev`.
const modules = import.meta.glob<unknown>(['../data/ecosystem.json', '../data/fixture.json'], {
  eager: true,
  import: 'default',
})

export function loadData(): LoadedData {
  const { source, raw } = pickDataset(modules)
  const { eco, problems } = parseEcosystem(raw)
  return { source, eco, problems }
}
