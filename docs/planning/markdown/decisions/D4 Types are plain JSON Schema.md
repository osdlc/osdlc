---
title: Types are plain JSON Schema
status: decided
decided: "2026-11-09"
---

Types are plain JSON Schema. A type builds on another with `x-extends: <prefix>/<type>`, or a local
type name. A record must pass every schema up the chain (`allOf`). A child can add or tighten rules,
never loosen them. Packs could compile to JSON Schema later.
