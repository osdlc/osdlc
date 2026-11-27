---
"@osdlc/workstation-cleaner": minor
---

Load descriptors from the package, the config folder's `descriptors/` and `--descriptor <file>`, after the built-ins and in one namespace, where a user file replaces a shipped one of the same name and any other clash is a file that can't be used. `config` reports such a file and goes on; `status`, `plan` and `clean` stop on it (exit 2) unless the run leaves its name out. A config entry that names no plugin is a warning for `status`, `plan` and `config`, and stops `clean`. A plan records the `--descriptor` files behind the plugins it ran, and `clean --plan` stops unless each is given. In `detect`, `ctx.running` holds the plugins found active so far.
