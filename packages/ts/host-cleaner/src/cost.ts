/** What deleting a candidate costs: fetched again, built again, or gone for good. */
export const COST_DESCRIPTIONS = ['re-download', 'rebuild', 'lost'] as const

export type CostDescription = (typeof COST_DESCRIPTIONS)[number]
