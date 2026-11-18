---
'@osdlc/observe': minor
---

session model: two new event kinds, `interrupted` (something stopped what the session was doing without ending it) and `closed` (the session's host pane was closed), each with a `cause` string and a `host`. Both describe the session and move no run state: the reducer applies them after `ended` too and never reports them as ignored. A reader from before this release skips the lines, since it does not know the kinds.
