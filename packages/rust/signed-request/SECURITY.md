# Security

To report a vulnerability, use GitHub private vulnerability reporting on the
repository that hosts this crate: open the repository's "Security" tab and
choose "Report a vulnerability". Please do not open a public issue for a
security problem.

If that option is not available, open an issue that asks for a private
contact, and do not include details of the problem in it.

This crate is a security boundary: it decides which HTTP requests a service
accepts from a peer. The most useful reports are a request that is accepted
when it should be refused (a wrong key, a changed method, target or body, a
signature made for another direction, audience or epoch), a replay that is
accepted inside the window, a signature compare or a secret that leaks (into a
log, an error or a timing difference), and a panic on request input. Please
include the request, the verifier configuration and the keys' epochs that show
the problem.

Known limits are listed in the README under "Residual risks" and "Replay and
clock limits": the replay cache is per process, no HTTP header other than the
signing headers is covered by the signature, and the middleware buffers a body
before it checks the signature. A report about one of these is welcome if it
shows the documented limit is wider than described.

Only the latest released version gets fixes.
