// Type-checked by tests/resolve.json under every preset merged together,
// including vue.json's `types: []` — so this file may not reach a node or bun
// global. It exists to give tsc an input; the assertion is that the config
// resolved at all.
export const probe = 1 as const
