---
'@osdlc/agent-call': minor
---

Add `maxOutputBytes` to `AgentCallSpec`: a cap on each output stream, stdout and stderr. A stream that passes it stops the agent's process group as a timeout does (SIGTERM, then SIGKILL after 5s), and `callAgent` resolves `ok: false` with the new `CallError` reason `output-limit`, whose `detail` names the stream. The output read so far stays in `raw`, truncated to the cap on a UTF-8 character boundary, and the new `RawProcessOutput.outputLimit` names the stream that passed it. A timeout or abort that came first stays the cause. `Infinity` means no cap; a value that is not a positive integer makes `callAgent` reject with a `RangeError`. Output is now read as bytes and decoded with the same streaming UTF-8 decoder as before, so collected text is unchanged.
