---
"@osdlc/agent-router": patch
---

`modelsDevRows` names the field when it refuses a malformed models.dev row. The reason was
`row is malformed`; it is now `row is malformed: <field>: <issue>`, for example
`row is malformed: cost.output: Invalid input: expected number, received null`, so a refresh says
which field to look at. A row that cannot be mapped at all is still `row is malformed`.
