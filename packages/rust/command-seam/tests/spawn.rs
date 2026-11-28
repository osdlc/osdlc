//! The real runner against small real commands.
#![cfg(unix)]

use std::time::{Duration, Instant};

use command_seam::{
    ClassifyContext, CommandFailureKind, CommandRunner, Outcome, RunOptions, SpawnProblem,
    SpawnRunner, StopReason, args, classify_failure, run_checked, shell_join,
};

fn sh(script: &str, opts: &RunOptions) -> command_seam::CommandResult {
    SpawnRunner::new("sh").run(&args(["-c", script]), opts)
}

#[test]
fn captures_stdout_and_a_zero_exit() {
    let r = sh("printf hello", &RunOptions::default());
    assert_eq!(r.outcome, Outcome::Exited(0));
    assert_eq!(r.stdout_lossy(), "hello");
    assert_eq!(r.stderr, b"");
    assert!(!r.output_incomplete);
}

#[test]
fn non_zero_exit_codes_surface_verbatim_with_stderr_apart_from_stdout() {
    let r = sh("echo out; echo oops >&2; exit 3", &RunOptions::default());
    assert_eq!(r.exit_code(), Some(3));
    assert_eq!(r.stdout_lossy(), "out\n");
    assert!(r.stderr_lossy().contains("oops"));
    assert_eq!(r.stop(), None);
}

#[test]
fn duration_covers_the_run() {
    let r = sh("sleep 0.2", &RunOptions::default());
    assert!(r.duration >= Duration::from_millis(200), "{:?}", r.duration);
    assert!(r.duration < Duration::from_secs(5));
}

#[test]
fn input_is_written_to_the_childs_stdin() {
    let r = SpawnRunner::new("cat").run(
        &[],
        &RunOptions::default().input("over the seam\n".as_bytes()),
    );
    assert_eq!(r.exit_code(), Some(0));
    assert_eq!(r.stdout_lossy(), "over the seam\n");
}

#[test]
fn without_input_stdin_is_closed() {
    let r =
        SpawnRunner::new("cat").run(&[], &RunOptions::default().timeout(Duration::from_secs(10)));
    assert_eq!(r.exit_code(), Some(0));
    assert_eq!(r.stdout, b"");
}

#[test]
fn large_input_and_output_on_both_pipes_do_not_deadlock() {
    // 4 MiB in and out, plus 4 MiB on stderr while the child reads: a runner
    // that reads one pipe at a time, or writes stdin first, would block.
    let input = vec![b'x'; 4 * 1024 * 1024];
    let r = sh(
        "head -c 4194304 /dev/zero >&2 & cat; wait",
        &RunOptions::default()
            .input(input.clone())
            .timeout(Duration::from_secs(60)),
    );
    assert_eq!(r.exit_code(), Some(0));
    assert_eq!(r.stdout, input);
    assert_eq!(r.stderr.len(), 4 * 1024 * 1024);
    assert!(!r.output_incomplete);
}

#[test]
fn a_child_that_closes_stdin_mid_write_is_a_result_not_a_crash() {
    let r = SpawnRunner::new("true").run(
        &[],
        &RunOptions::default().input(vec![0u8; 8 * 1024 * 1024]),
    );
    assert_eq!(r.exit_code(), Some(0));
}

#[test]
fn argv_is_never_re_parsed_as_shell() {
    let r = SpawnRunner::new("printf").run(
        &args(["%s|", "a b", "$HOME", ";echo x"]),
        &RunOptions::default(),
    );
    assert_eq!(r.stdout_lossy(), "a b|$HOME|;echo x|");
}

#[test]
fn env_extend_merges_over_the_parent_environment() {
    let r = sh(
        "echo \"$T1_SEAM_PROBE:$HOME\"",
        &RunOptions::default().env("T1_SEAM_PROBE", "injected"),
    );
    let out = r.stdout_lossy();
    assert!(out.starts_with("injected:"), "{out}");
    assert_ne!(out.trim(), "injected:", "HOME should survive the merge");
}

#[test]
fn env_remove_drops_an_inherited_variable() {
    // The test process has HOME set, so removal is observable.
    let r = sh(
        "echo \"${HOME-absent}\"",
        &RunOptions::default().env_remove("HOME"),
    );
    assert_eq!(r.stdout_lossy().trim(), "absent");
}

#[test]
fn env_replace_leaves_nothing_inherited() {
    let r = SpawnRunner::new("/bin/sh").run(
        &args(["-c", "echo \"${HOME-absent}:${KEEP-absent}\""]),
        &RunOptions::default().env_replace([("KEEP", "yes")]),
    );
    assert_eq!(r.stdout_lossy().trim(), "absent:yes");
}

#[test]
fn env_replace_with_nothing_passes_an_empty_environment() {
    let r = SpawnRunner::new("/bin/sh").run(
        &args(["-c", "echo \"${HOME-absent}\""]),
        &RunOptions::default().env_replace::<[(&str, &str); 0], _, _>([]),
    );
    assert_eq!(r.stdout_lossy().trim(), "absent");
}

#[test]
fn cwd_sets_the_working_directory() {
    let dir = tempfile::tempdir().unwrap();
    let want = dir.path().canonicalize().unwrap();
    let r = sh("pwd -P", &RunOptions::in_dir(dir.path()));
    assert_eq!(r.stdout_lossy().trim(), want.to_str().unwrap());
}

#[test]
fn a_missing_cwd_is_bad_cwd_not_not_installed() {
    let dir = tempfile::tempdir().unwrap();
    let r = sh("true", &RunOptions::in_dir(dir.path().join("nope")));
    assert_eq!(
        r.stop().unwrap().reason,
        StopReason::Spawn(SpawnProblem::BadCwd)
    );
    let f = classify_failure(&r, &ClassifyContext::default()).unwrap();
    assert_eq!(f.kind, CommandFailureKind::BadCwd);
}

#[test]
fn a_cwd_that_is_a_file_is_bad_cwd_too() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("f");
    std::fs::write(&file, "x").unwrap();
    let r = sh("true", &RunOptions::in_dir(&file));
    assert_eq!(
        r.stop().unwrap().reason,
        StopReason::Spawn(SpawnProblem::BadCwd)
    );
}

#[test]
fn a_missing_binary_is_not_installed_and_the_message_names_it() {
    let nope = SpawnRunner::new("definitely-not-a-real-binary-t1");
    let r = nope.run(&[], &RunOptions::default());
    assert_eq!(r.exit_code(), None);
    let stop = r.stop().unwrap();
    assert_eq!(stop.reason, StopReason::Spawn(SpawnProblem::NotFound));
    assert_eq!(stop.signal, None);
    assert!(
        stop.error
            .as_deref()
            .unwrap()
            .contains("definitely-not-a-real-binary-t1")
    );
    let f = classify_failure(
        &r,
        &ClassifyContext {
            binary: nope.binary(),
            ..ClassifyContext::default()
        },
    )
    .unwrap();
    assert_eq!(f.kind, CommandFailureKind::NotInstalled);
}

#[test]
fn a_file_without_the_execute_bit_is_not_executable() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("tool");
    std::fs::write(&file, "#!/bin/sh\n").unwrap();
    std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o644)).unwrap();
    let r = SpawnRunner::new(&file).run(&[], &RunOptions::default());
    let stop = r.stop().unwrap();
    assert_eq!(stop.reason, StopReason::Spawn(SpawnProblem::NotExecutable));
    assert_eq!(stop.signal, None);
}

#[test]
fn a_nul_byte_in_an_argument_is_a_spawn_failure_not_a_panic() {
    let r = SpawnRunner::new("true").run(&args(["a\0b"]), &RunOptions::default());
    let stop = r.stop().unwrap();
    assert!(matches!(stop.reason, StopReason::Spawn(_)));
    assert_eq!(stop.signal, None);
}

#[test]
fn a_timeout_kills_the_child_and_reports_it() {
    let started = Instant::now();
    let r = sh(
        "sleep 30",
        &RunOptions::default().timeout(Duration::from_millis(250)),
    );
    assert!(started.elapsed() < Duration::from_secs(10));
    assert!(r.timed_out());
    assert_eq!(r.exit_code(), None);
    assert_eq!(r.signal(), Some(9));
    assert!(r.output_incomplete);
}

#[test]
fn a_timeout_is_a_hard_cap_even_for_a_child_that_ignores_sigterm() {
    let started = Instant::now();
    let r = sh(
        "trap '' TERM; sleep 10",
        &RunOptions::default().timeout(Duration::from_millis(250)),
    );
    assert!(started.elapsed() < Duration::from_secs(5));
    assert!(r.timed_out());
}

#[test]
fn a_timeout_too_long_for_the_clock_is_no_timeout_not_a_panic() {
    let r = sh("printf ok", &RunOptions::default().timeout(Duration::MAX));
    assert_eq!(r.outcome, Outcome::Exited(0));
    assert_eq!(r.stdout_lossy(), "ok");
}

#[cfg(target_os = "linux")]
#[test]
fn the_timed_out_child_is_gone_not_left_running_or_a_zombie() {
    let dir = tempfile::tempdir().unwrap();
    let pid_file = dir.path().join("pid");
    let script = format!("echo $$ > {}; exec sleep 30", pid_file.display());
    let r = sh(
        &script,
        &RunOptions::default().timeout(Duration::from_millis(500)),
    );
    assert!(r.timed_out());
    let pid = std::fs::read_to_string(&pid_file).unwrap();
    assert!(
        !std::path::Path::new(&format!("/proc/{}", pid.trim())).exists(),
        "pid {} still exists",
        pid.trim()
    );
}

#[test]
fn partial_output_before_a_timeout_is_kept_when_the_pipes_close() {
    let r = sh(
        "printf before; exec sleep 30",
        &RunOptions::default().timeout(Duration::from_millis(500)),
    );
    assert!(r.timed_out());
    assert_eq!(r.stdout_lossy(), "before");
}

#[test]
fn a_surviving_grandchild_holding_the_pipe_does_not_hold_the_run() {
    // The shell is killed at the timeout; its backgrounded `sleep` keeps the
    // stdout pipe open. The runner stops waiting after its grace period.
    let started = Instant::now();
    let r = sh(
        "sleep 30 & wait",
        &RunOptions::default().timeout(Duration::from_millis(200)),
    );
    assert!(started.elapsed() < Duration::from_secs(10));
    assert!(r.timed_out());
    assert!(r.output_incomplete);
}

#[test]
fn output_read_before_a_kill_is_kept_when_a_grandchild_holds_the_pipe() {
    let r = sh(
        "printf before; sleep 7.19 & wait",
        &RunOptions::default().timeout(Duration::from_millis(500)),
    );
    assert!(r.timed_out());
    assert!(r.output_incomplete);
    assert_eq!(r.stdout_lossy(), "before");
}

#[test]
fn a_grandchild_that_outlives_the_child_does_not_hold_a_run_without_a_timeout() {
    let started = Instant::now();
    let r = sh(
        "printf kept; printf warned >&2; sleep 6.13 & exit 0",
        &RunOptions::default(),
    );
    let elapsed = started.elapsed();
    assert!(elapsed < Duration::from_secs(4), "{elapsed:?}");
    assert_eq!(r.exit_code(), Some(0));
    assert_eq!(r.stdout_lossy(), "kept");
    assert_eq!(r.stderr_lossy(), "warned");
    assert!(r.output_incomplete);
}

#[test]
fn a_grandchild_that_outlives_the_child_is_not_waited_for_until_the_timeout() {
    // The pipes get the usual grace period, not the rest of the timeout.
    let started = Instant::now();
    let r = sh(
        "printf kept; sleep 8.41 & exit 0",
        &RunOptions::default().timeout(Duration::from_secs(5)),
    );
    let elapsed = started.elapsed();
    assert!(elapsed < Duration::from_millis(3500), "{elapsed:?}");
    assert_eq!(r.exit_code(), Some(0));
    assert_eq!(r.stdout_lossy(), "kept");
    assert!(r.output_incomplete);
}

#[test]
fn a_child_that_exits_while_a_grandchild_holds_the_pipe_is_reaped_at_once() {
    // `duration` ends at the exit, not when the pipes close.
    let r = sh(
        "sleep 2 & exit 0",
        &RunOptions::default().timeout(Duration::from_secs(30)),
    );
    assert_eq!(r.exit_code(), Some(0));
    assert!(r.duration < Duration::from_secs(1), "{:?}", r.duration);
    assert!(r.output_incomplete);
}

#[test]
fn output_is_whole_when_a_grandchild_closes_the_pipe_within_the_grace_period() {
    let r = sh(
        "printf first; (sleep 0.35; printf ' last') & exit 0",
        &RunOptions::default(),
    );
    assert_eq!(r.exit_code(), Some(0));
    assert_eq!(r.stdout_lossy(), "first last");
    assert!(!r.output_incomplete);
}

#[test]
fn a_child_that_closes_its_pipes_and_runs_on_still_times_out() {
    let started = Instant::now();
    let r = sh(
        "exec >/dev/null 2>&1; sleep 30",
        &RunOptions::default().timeout(Duration::from_millis(300)),
    );
    assert!(started.elapsed() < Duration::from_secs(10));
    assert!(r.timed_out());
    assert_eq!(r.signal(), Some(9));
}

#[test]
fn a_child_killed_by_a_signal_is_stopped_not_exit_one() {
    let r = sh("kill -9 $$", &RunOptions::default());
    let stop = r.stop().unwrap();
    assert_eq!(stop.reason, StopReason::Signal);
    assert_eq!(stop.signal, Some(9));
    assert_eq!(r.exit_code(), None);
}

#[test]
fn an_exit_one_is_distinguished_from_a_run_that_never_exited() {
    let answered = sh("exit 1", &RunOptions::default());
    assert_eq!(answered.exit_code(), Some(1));
    assert_eq!(answered.stop(), None);
    let killed = sh(
        "sleep 30",
        &RunOptions::default().timeout(Duration::from_millis(100)),
    );
    assert_eq!(killed.exit_code(), None);
}

#[test]
fn the_output_cap_kills_a_chatty_child_and_keeps_the_first_bytes() {
    let r = sh(
        "yes abcdefghij",
        &RunOptions::default()
            .max_output_bytes(1000)
            .timeout(Duration::from_secs(30)),
    );
    let stop = r.stop().unwrap();
    assert_eq!(stop.reason, StopReason::Output);
    assert_eq!(r.stdout.len(), 1000);
    assert!(r.stdout.starts_with(b"abcdefghij\n"));
    assert!(r.output_incomplete);
}

#[test]
fn output_at_or_under_the_cap_is_untouched() {
    let r = sh("printf 12345", &RunOptions::default().max_output_bytes(5));
    assert_eq!(r.exit_code(), Some(0));
    assert_eq!(r.stdout_lossy(), "12345");
}

#[test]
fn run_checked_returns_the_result_on_exit_zero() {
    let r = run_checked(
        &SpawnRunner::new("printf"),
        &args(["ok"]),
        &RunOptions::default(),
    )
    .unwrap();
    assert_eq!(r.stdout_lossy(), "ok");
}

#[test]
fn run_checked_fails_with_the_argv_and_the_full_result() {
    let sh_runner = SpawnRunner::new("sh");
    let a = args(["-c", "echo nope >&2; echo out; exit 4"]);
    let e = run_checked(&sh_runner, &a, &RunOptions::default()).unwrap_err();
    assert_eq!(e.result.exit_code(), Some(4));
    assert_eq!(e.failure.kind, CommandFailureKind::Exit);
    assert_eq!(e.failure.args, a);
    assert_eq!(e.detail(), "nope\nout");
    let words = ["sh", "-c", "echo nope >&2; echo out; exit 4"];
    assert_eq!(
        e.to_string(),
        format!("command failed (exit 4): {}\nnope", shell_join(&words))
    );
}

#[test]
fn run_checked_treats_a_missing_binary_as_not_installed() {
    let e = run_checked(
        &SpawnRunner::new("definitely-not-a-real-binary-t2"),
        &[],
        &RunOptions::default(),
    )
    .unwrap_err();
    assert_eq!(e.failure.kind, CommandFailureKind::NotInstalled);
    assert!(
        e.to_string()
            .starts_with("command failed (did not exit: not-installed)")
    );
}

#[test]
fn run_checked_treats_a_timeout_as_a_failure() {
    let e = run_checked(
        &SpawnRunner::new("sleep"),
        &args(["30"]),
        &RunOptions::default().timeout(Duration::from_millis(100)),
    )
    .unwrap_err();
    assert_eq!(e.failure.kind, CommandFailureKind::Timeout);
}

#[test]
fn run_checked_treats_output_cut_short_as_a_failure() {
    // Exit 0, but a grandchild still holds stdout when the grace period
    // ends: the output may be part of an answer, so it is not a success.
    let e = run_checked(
        &SpawnRunner::new("sh"),
        &args(["-c", "printf part; sleep 5.83 & exit 0"]),
        &RunOptions::default(),
    )
    .unwrap_err();
    assert_eq!(e.failure.kind, CommandFailureKind::OutputIncomplete);
    assert_eq!(e.result.exit_code(), Some(0));
    assert_eq!(e.result.stdout_lossy(), "part");
    assert!(
        e.to_string()
            .starts_with("command failed (exit 0, output cut short): sh -c "),
        "{e}"
    );
}

#[test]
fn fan_out_over_threads_uses_the_runner_concurrently() {
    let runner = SpawnRunner::new("sh");
    let started = Instant::now();
    std::thread::scope(|s| {
        let handles: Vec<_> = (0..4)
            .map(|_| s.spawn(|| runner.run(&args(["-c", "sleep 0.5"]), &RunOptions::default())))
            .collect();
        for h in handles {
            assert_eq!(h.join().unwrap().exit_code(), Some(0));
        }
    });
    assert!(started.elapsed() < Duration::from_millis(1800));
}
