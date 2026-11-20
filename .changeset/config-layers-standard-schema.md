---
'@osdlc/config-layers': minor
---

The machine file reads through any Standard Schema validator (zod 4, valibot, arktype or a hand-written one), not only zod. `machineConfigFile`'s `schema` is now a `StandardSchemaV1`, and its issues come out as `path: message`. New exports: `validateStandard`, `StandardSchemaV1`, `StandardIssue`, `StandardValidation`. With a non-zod schema an unknown key is reported as `invalid` rather than `unknown_key`. Everything that reads a schema's shape (sections, the project loader, `configNeeds`, scaffold, reference) stays zod-only.
