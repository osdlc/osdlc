// Type-checked by tests/resolve.json under every preset merged together,
// including vue.json's `types: []`, so this file must not use a node or bun
// global. It only gives tsc an input. The test is that the config resolves.
export const probe = 1 as const
