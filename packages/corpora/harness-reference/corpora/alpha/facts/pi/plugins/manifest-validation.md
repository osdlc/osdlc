---
type: Harness Fact
title: "pi: Plugin manifest validation"
description: "Plugin manifest validation in pi, as observed over time."
tags: [plugins]
harness: pi
subject: plugins/manifest-validation
observations:
  - value:
      unknown_fields: ignored
      invalid_fields: "a pi resource key that is not an array of strings, or a changelogPath that is not a string, is ignored silently; unreadable or malformed JSON, or a pi value that is not an object, makes readPiManifest return no manifest; for extensions pi then falls back to index.ts or index.js"
      dependency_warning: "host-provided pi packages listed in dependencies draw an extension warning"
    since: null
    until: null
    observed: "2026-11-05"
    source: pi-source
    locator: "packages/coding-agent/src/core/pi-manifest.ts:18-42; packages/coding-agent/src/core/resource-loader.ts:75-100; packages/coding-agent/src/core/extensions/loader.ts:762-780 at 2a32a605a9f18a5f0191f65358a2e764b2f69fc7"
    evidence: source
open:
  - question: "Does pi ship a command or published JSON Schema that validates the pi block in package.json? None was found in the source or the packages docs."
    observed: "2026-11-05"
    source: pi-source
sources:
  - id: pi-source
    resource: "https://github.com/earendil-works/pi/tree/2a32a605a9f18a5f0191f65358a2e764b2f69fc7/packages/coding-agent/src/core"
    title: "earendil-works/pi core source at 2a32a60"
---

What the sources say about [Plugin manifest validation](/subjects/plugins/manifest-validation.md)
in [pi](/harnesses/pi.md).

## Observations

- 2026-11-05: unknown fields: ignored; a wrong-typed key is dropped without a message; a manifest
  that fails to parse is treated as absent. Host-provided packages in `dependencies` draw a
  warning.[^pi-source]

  ```ts
  		if (!isObject(pkg) || !isObject(pkg.pi)) {
  			return null;
  		}
  		const manifest: PiManifest = {};
  		for (const field of RESOURCE_FIELDS) {
  			const entries = pkg.pi[field];
  			if (Array.isArray(entries) && entries.every((entry) => typeof entry === "string")) {
  				manifest[field] = entries;
  			}
  		}
  	...
  	} catch {
  		return null;
  	}
  ```

  > warning: `Host-provided extension packages must be declared in peerDependencies with a "*" range, not dependencies: ${hostDependencies.join(", ")}. ...`

## Open questions

- Does pi ship a command or published JSON Schema that validates the `pi` block? None was found.[^pi-source]

[^pi-source]: earendil-works/pi core source at 2a32a60
