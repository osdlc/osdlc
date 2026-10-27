# Security

To report a vulnerability, use GitHub private vulnerability reporting on the
repository that hosts this crate: open the repository's "Security" tab and
choose "Report a vulnerability". Please do not open a public issue for a
security problem.

If that option is not available, open an issue that asks for a private
contact, and do not include details of the problem in it.

The crate has no `unsafe` code and does no file or network access. The most
likely problems are inputs that make the scanner or resolver slow or panic.
Please include a minimal input that shows the problem.

Only the latest released version gets fixes.
