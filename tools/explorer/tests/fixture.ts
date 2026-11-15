import raw from '../data/fixture.json'
import { parseEcosystem } from '../src/model/data'
import type { EcoNode, Ecosystem } from '../src/model/types'

export const fixture: Ecosystem = parseEcosystem(raw).eco

export function node(id: string): EcoNode {
  const found = fixture.nodes.find((n) => n.id === id)
  if (!found) throw new Error(`No fixture node ${id}`)
  return found
}
