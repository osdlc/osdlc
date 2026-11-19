// A JSON import, so the package stays browser-safe.
import snapshot from './snapshot.json' with { type: 'json' }

import { deepFreeze } from '../freeze.ts'
import { layerCatalogue } from './layers.ts'
import { queryCatalogue, type CatalogueQuery } from './query.ts'
import type { Catalogue, CatalogueLayer } from './types.ts'

// One `seen` set across the freezes, so the query's catalogue is not walked twice.
const frozen = new WeakSet<object>()

/**
 * The shipped snapshot as a catalogue layer: the lowest layer, regenerated at release time and
 * reviewed as a diff. Deep-frozen, because every caller shares it.
 */
export const SNAPSHOT_LAYER: CatalogueLayer = deepFreeze(snapshot as CatalogueLayer, frozen)

/** The snapshot alone, merged; deep-frozen. */
export const BUILTIN_CATALOGUE: Catalogue = deepFreeze(layerCatalogue([SNAPSHOT_LAYER]), frozen)

/**
 * A query over {@link BUILTIN_CATALOGUE}. The query and the catalogue rows it returns are frozen;
 * arrays it builds per call are not.
 */
export const BUILTIN_QUERY: CatalogueQuery = deepFreeze(queryCatalogue(BUILTIN_CATALOGUE), frozen)
