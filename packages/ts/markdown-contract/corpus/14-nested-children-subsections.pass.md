## Decision

We split the engine from the SDLC integration.

### Components

The generic `markdown-contract` package and the per-entity `contract.ts`.

### Resolution

Ship the engine standalone; SDLC consumes it as data.