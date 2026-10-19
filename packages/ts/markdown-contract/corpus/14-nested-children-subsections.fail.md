## Decision

We split the engine from the SDLC integration.

### Resolution

Ship the engine standalone; SDLC consumes it as data.

### Components

The generic `markdown-contract` package and the per-entity `contract.ts`.