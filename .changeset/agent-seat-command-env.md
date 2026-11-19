---
'@osdlc/agent-seat': minor
---

`CommandRequest` gains `env`, applied by every host with `withEnv`, so a workspace shell can carry variables without hiding exports inside `argv`. New `envPrefixLine(argv, env)` builds the plain POSIX `K=V cmd` prefix as a string, so a shell function or alias still runs where `env K=V cmd` would not. New `commandArgv(req)` returns a request's argv under its env.
