---
"@osdlc/config-layers": minor
---

`machineConfigFile` takes an optional `app`. With it, the machine file lives in
an app's directory under the tool's: `tool: 'osdlc', app: 'pr-update'` gives
`<config>/osdlc/pr-update/config.yaml`. `app` must be a single path segment,
and `path()` throws `TieredDirsError` (`INVALID_KEY`) when it is not, as it does
for a bad `tool`. `app` changes only the directory: the default relocation
variable is still built from `tool`, so a tool under a family root should pass
its own `env`, such as `PR_UPDATE_MACHINE_CONFIG`. Without `app`, nothing
changes.
