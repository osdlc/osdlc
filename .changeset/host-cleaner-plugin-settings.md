---
"@osdlc/host-cleaner": minor
---

Each plugin's entry in the config's `plugins` is now a validated schema (through `@osdlc/config-layers`): a misspelt key or a wrong type is refused when the config loads, naming the plugin and the key. `plugins.<name>.enabled: false` leaves a plugin out of a run (`--plugin <name>` still runs it). New `host-cleaner config` prints every plugin's effective settings, defaults included.
