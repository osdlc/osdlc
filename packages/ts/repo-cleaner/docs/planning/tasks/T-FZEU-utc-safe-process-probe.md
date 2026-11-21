---
id: T-FZEU
type: task
state: done
created: 2026-11-07
---

# T-FZEU: The process probe compares start times in UTC

## Goal

The default `ProcessProbe` reads `ps` start times in UTC and the C locale, and answers a dead pid without spawning `ps`. Today it reads them as local time, so the repeated hour of a daylight-saving fall-back can make a live lock owner look gone. sdlc waits on this to share the probe (sksizer/dev T-D3J4).

## Spec

[#679](https://github.com/osdlc/osdlc/issues/679) holds the full spec: today's code with links, the proposal and the acceptance criteria. Discuss and refine it there. When the issue closes, set this task's `state` to `done` and add an Outcome section.

## Outcome

Shipped in [#910](https://github.com/osdlc/osdlc/pull/910). The default probe
runs `ps -o lstart=` with `TZ=UTC` and the C locale, so a daylight-saving
fall-back no longer makes a live lock owner look gone, and answers a pid that
`process.kill(pid, 0)` finds gone without spawning `ps`. The code is
`src/processes.ts`.
