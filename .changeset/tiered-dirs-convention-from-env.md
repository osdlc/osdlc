---
'@osdlc/tiered-dirs': minor
---

New `ResolveOptions.conventionFromEnv`. Pass `false` to pin `convention`, so `<P>_CONVENTION` cannot override it. Use it for a file another program reads at a fixed path, such as a shell launcher that reads `~/.config/<tool>`. The default, `true`, keeps today's behaviour.
