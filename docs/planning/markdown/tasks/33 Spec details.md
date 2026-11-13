---
number: 33
title: Spec details
detail: "YAML, format, codes"
status: todo
type: functional
milestone: "[m-spec](../milestones/m-spec.md)"
after:
  - "[3 Publish 0.2.0](3%20Publish%200.2.0.md)"
---

Spec: YAML 1.2, format, error codes. The spec says that YAML 1.2 applies, so an unquoted date stays
a string, and that JSON Schema `format` is asserted. The TypeScript validator already asserts it
through ajv-formats. This task also defines stable error codes for validator messages, so consumers
such as agent-call can rely on them. After 3.
