# Security

To report a vulnerability, use GitHub private vulnerability reporting on the
repository that hosts this crate: open the repository's "Security" tab and
choose "Report a vulnerability". Please do not open a public issue for a
security problem.

If that option is not available, open an issue that asks for a private
contact, and do not include details of the problem in it.

This crate is a security boundary: it decides which HTTP requests reach an
application served beyond loopback. The most useful reports are a request
that passes the guard when it should be refused (a wrong or missing token, a
foreign `Host` or `Origin`, a path that slips past a route rule, a grant
higher than the token's), a token that leaks (into a URL, a log, a redirect or
a file another user can read), and a panic on request input. Please include
the request, the configuration and the guard policy that show the problem.

The token travels over plain HTTP. Use the crate on networks you trust; it
does not protect against someone who can read the traffic.

Only the latest released version gets fixes.
