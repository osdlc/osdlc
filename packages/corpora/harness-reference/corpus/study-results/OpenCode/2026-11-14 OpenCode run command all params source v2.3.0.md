---
kind: source
reportedIn:
  - "[OpenCode source commands commands.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20commands%20commands.ts%20at%20a6b15d3.md)"
harness: "[OpenCode](../../harnesses/OpenCode.md)"
version: 2.3.0
version_basis: exact
observed: 2026-11-14
locator: "#L400-L451, run command (whole definition)"
excerpt:
  exact: 'Spec.make("run", { description: "Run OpenCode with a message", globalFlags: ServerFlags, params: { message: Argument.String("message").pipe( Argument.withDescription("Message to send"), Argument.variadic({ min: 0 }), ), continue: Flag.Boolean("continue").pipe( Flag.withAlias("c"), Flag.withDescription("Continue the last session"), Flag.withDefault(false), ), session: Flag.String("session").pipe( Flag.withAlias("s"), Flag.withDescription("Session ID to continue, or to create if it does not exist"), Flag.optional, ), fork: Flag.Boolean("fork").pipe( Flag.withDescription("Fork the session before continuing"), Flag.withDefault(false), ), worktree: CliFlag.optionalValue("worktree", "name").pipe( Flag.withAlias("w"), Flag.withDescription("Start a new session in a new git worktree, optionally with this name"), ), model: Flag.String("model").pipe( Flag.withAlias("m"), Flag.withDescription("Model to use in the format provider/model#variant"), Flag.optional, ), agent: Flag.String("agent").pipe(Flag.withDescription("Agent to use"), Flag.optional), format: Flag.Literals("format", ["default", "json"]).pipe( Flag.withDescription("Output format"), Flag.withDefault("default"), ), file: Flag.String("file").pipe( Flag.withAlias("f"), Flag.withDescription("File to attach to the message"), Flag.atMost(100), ), title: Flag.String("title").pipe(Flag.withDescription("Session title"), Flag.optional), archived: Flag.Boolean("archived").pipe( Flag.withDescription( "Create the session archived so it stays out of session lists (useful for scripted or CI runs)", ), Flag.withDefault(false), ), thinking: Flag.Boolean("thinking").pipe(Flag.withDescription("Show thinking blocks"), Flag.withDefault(false)), ...PermissionParams, }, }),'
  prefix: "alse), Flag.withHidden), }, }), "
  suffix: ' Spec.make("session", { descript'
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> Spec.make("run", { description: "Run OpenCode with a message", globalFlags: ServerFlags, params: { message: Argument.String("message").pipe( Argument.withDescription("Message to send"), Argument.variadic({ min: 0 }), ), continue: Flag.Boolean("continue").pipe( Flag.withAlias("c"), Flag.withDescription("Continue the last session"), Flag.withDefault(false), ), session: Flag.String("session").pipe( Flag.withAlias("s"), Flag.withDescription("Session ID to continue, or to create if it does not exist"), Flag.optional, ), fork: Flag.Boolean("fork").pipe( Flag.withDescription("Fork the session before continuing"), Flag.withDefault(false), ), worktree: CliFlag.optionalValue("worktree", "name").pipe( Flag.withAlias("w"), Flag.withDescription("Start a new session in a new git worktree, optionally with this name"), ), model: Flag.String("model").pipe( Flag.withAlias("m"), Flag.withDescription("Model to use in the format provider/model#variant"), Flag.optional, ), agent: Flag.String("agent").pipe(Flag.withDescription("Agent to use"), Flag.optional), format: Flag.Literals("format", ["default", "json"]).pipe( Flag.withDescription("Output format"), Flag.withDefault("default"), ), file: Flag.String("file").pipe( Flag.withAlias("f"), Flag.withDescription("File to attach to the message"), Flag.atMost(100), ), title: Flag.String("title").pipe(Flag.withDescription("Session title"), Flag.optional), archived: Flag.Boolean("archived").pipe( Flag.withDescription( "Create the session archived so it stays out of session lists (useful for scripted or CI runs)", ), Flag.withDefault(false), ), thinking: Flag.Boolean("thinking").pipe(Flag.withDescription("Show thinking blocks"), Flag.withDefault(false)), ...PermissionParams, }, }),
