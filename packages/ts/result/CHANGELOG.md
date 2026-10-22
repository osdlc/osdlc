# @osdlc/result

## 0.1.0

### Minor Changes

- d9b0f77: First release. A plain-object `Result` (`ok`, `err`, `map`, `mapErr`, `andThen`, `unwrapOr`, `unwrap`, `match`, `attempt`, `attemptAsync`) and a `Failure` shape written for people (`kind`, `message`, `hint`, `detail`, `cause`) with `FailureError`, `isFailure` and `describe`. Zero dependencies.
