//! `ProcessGroups::stop_on_signals`, against a child program.
//!
//! A signal sent to, or an action registered in, this test process would reach every test in it,
//! so each test signals a child program: this test binary running only [`host`].
#![cfg(unix)]

use std::io::{BufRead, BufReader};
use std::os::unix::process::ExitStatusExt;
use std::path::Path;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::mpsc::{Receiver, RecvTimeoutError, channel};
use std::time::{Duration, Instant};

use command_seam::{CommandRunner, ProcessGroups, RunOptions, SpawnRunner, args};
use rustix::io::Errno;
use rustix::process::{Pid, Signal, kill_process_group, test_kill_process_group};

/// What the child program does: one of the modes [`host`] lists.
const MODE: &str = "COMMAND_SEAM_SIGNAL_HOST";
/// How long the sleeps of `run` last, so a leftover can be told apart by its command line.
const SLEEP: &str = "COMMAND_SEAM_SIGNAL_SLEEP";
/// A folder the run's script writes its process group id into.
const DIR: &str = "COMMAND_SEAM_SIGNAL_DIR";

/// The child program. Does nothing unless [`MODE`] is set.
///
/// - `run`: calls `stop_on_signals`, starts `sleep N & sleep N; wait` in a process group, prints
///   `started <pgid>` once it has started, and, when the run has returned, `reason <reason>` and
///   `signal <Forwarded::signal>`. It exits with `Forwarded::exit_code`, or 1 without one.
/// - `wait`: calls `stop_on_signals`, prints `ready`, then sleeps, printing `forwarded <signal>`
///   once a signal has been forwarded. Exits 3 after 20 s.
/// - `wait-without-call`: the same without the call.
/// - `handles`: calls `stop_on_signals` on two handles, prints `ready`, waits for a signal, then
///   calls it on a third handle and prints `stopped <a> <b> <c>` (each `is_stopped`) and
///   `signals <a> <b> <c>` (each `Forwarded::signal`). Exits with the third's `exit_code`.
#[test]
#[ignore = "the child program of the other tests here; does nothing when run by hand"]
fn host() {
    let Ok(mode) = std::env::var(MODE) else {
        return;
    };
    if mode == "handles" {
        handles();
    }
    let groups = ProcessGroups::new();
    let forwarded = (mode != "wait-without-call").then(|| groups.stop_on_signals().unwrap());
    if mode == "run" {
        let forwarded = forwarded.unwrap();
        let seconds = std::env::var(SLEEP).unwrap();
        let file = Path::new(&std::env::var(DIR).unwrap()).join("pgid");
        let script = format!(
            "echo $$ > \"$1.tmp\"; mv \"$1.tmp\" \"$1\"; sleep {seconds} & sleep {seconds}; wait"
        );
        let watched = file.clone();
        std::thread::spawn(move || {
            loop {
                if let Ok(text) = std::fs::read_to_string(&watched)
                    && let Ok(pgid) = text.trim().parse::<i32>()
                {
                    println!("started {pgid}");
                    return;
                }
                std::thread::sleep(Duration::from_millis(10));
            }
        });
        let argv = vec![
            "-c".into(),
            script.into(),
            "sh".into(),
            file.into_os_string(),
        ];
        let result =
            SpawnRunner::new("sh").run(&argv, &RunOptions::default().process_group(&groups));
        println!("reason {:?}", result.stop().map(|stop| stop.reason));
        println!("signal {:?}", forwarded.signal());
        std::process::exit(forwarded.exit_code().unwrap_or(1));
    }
    println!("ready");
    let until = Instant::now() + Duration::from_secs(20);
    let mut told = false;
    while Instant::now() < until {
        if let Some(signal) = forwarded.as_ref().and_then(|f| f.signal())
            && !told
        {
            println!("forwarded {signal}");
            told = true;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    std::process::exit(3);
}

/// The `handles` mode of [`host`].
fn handles() -> ! {
    let (a, b) = (ProcessGroups::new(), ProcessGroups::new());
    let (fa, fb) = (a.stop_on_signals().unwrap(), b.stop_on_signals().unwrap());
    println!("ready");
    let until = Instant::now() + Duration::from_secs(20);
    while fa.signal().is_none() {
        if Instant::now() >= until {
            std::process::exit(3);
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    let c = ProcessGroups::new();
    let fc = c.stop_on_signals().unwrap();
    println!(
        "stopped {} {} {}",
        a.is_stopped(),
        b.is_stopped(),
        c.is_stopped()
    );
    println!(
        "signals {:?} {:?} {:?}",
        fa.signal(),
        fb.signal(),
        fc.signal()
    );
    std::process::exit(fc.exit_code().unwrap_or(1));
}

/// A started child program. Dropping it kills the child, and, in a failing test, its run's group.
struct Host {
    child: Child,
    lines: Receiver<String>,
    pgid: Option<i32>,
    _dir: tempfile::TempDir,
}

impl Host {
    fn start(mode: &str, sleep: &str) -> Host {
        Host::start_ignoring(mode, sleep, None)
    }

    /// [`Host::start`], with the child ignoring `ignored` (`HUP`, say), set by a shell that then
    /// `exec`s it.
    fn start_ignoring(mode: &str, sleep: &str, ignored: Option<&str>) -> Host {
        let dir = tempfile::tempdir().unwrap();
        let exe = std::env::current_exe().unwrap();
        let mut command = match ignored {
            None => Command::new(&exe),
            Some(signal) => {
                let mut command = Command::new("sh");
                command
                    .arg("-c")
                    .arg(format!("trap '' {signal}; exec \"$0\" \"$@\""))
                    .arg(&exe);
                command
            }
        };
        let mut child = command
            .args([
                "--exact",
                "host",
                "--ignored",
                "--nocapture",
                "--test-threads=1",
            ])
            .env(MODE, mode)
            .env(SLEEP, sleep)
            .env(DIR, dir.path())
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        let stdout = child.stdout.take().unwrap();
        let (send, lines) = channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { return };
                if send.send(line).is_err() {
                    return;
                }
            }
        });
        Host {
            child,
            lines,
            pgid: None,
            _dir: dir,
        }
    }

    /// What follows `prefix` on the first line that holds it, within 10 s. The first line the
    /// child prints shares a line with the test harness's `test host ... `.
    fn wait_for(&mut self, prefix: &str) -> String {
        let until = Instant::now() + Duration::from_secs(10);
        loop {
            let left = until.saturating_duration_since(Instant::now());
            match self.lines.recv_timeout(left) {
                Ok(line) => {
                    if let Some((_, rest)) = line.split_once(prefix) {
                        return rest.trim().to_owned();
                    }
                }
                Err(e) => panic!("no line with {prefix:?}: {e:?}"),
            }
        }
    }

    /// Sends `signal` (`INT`, `TERM` or `HUP`) with `kill`.
    fn signal(&self, signal: &str) {
        let pid = self.child.id().to_string();
        let result = SpawnRunner::new("kill").run(
            &args([format!("-{signal}").as_str(), pid.as_str()]),
            &RunOptions::default(),
        );
        assert_eq!(result.exit_code(), Some(0), "{result:?}");
    }

    /// How the child ended, when it did within `within`.
    fn exit_within(&mut self, within: Duration) -> Option<ExitStatus> {
        let until = Instant::now() + within;
        loop {
            if let Some(status) = self.child.try_wait().unwrap() {
                return Some(status);
            }
            if Instant::now() >= until {
                return None;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    }

    /// Every line the child printed that has not been read, once its stdout has closed.
    fn rest(&self) -> Vec<String> {
        let mut rest = Vec::new();
        loop {
            match self.lines.recv_timeout(Duration::from_secs(5)) {
                Ok(line) => rest.push(line),
                Err(RecvTimeoutError::Disconnected) => return rest,
                Err(RecvTimeoutError::Timeout) => panic!("stdout still open; read {rest:?}"),
            }
        }
    }
}

impl Drop for Host {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        // Only on failure: once the group is gone its id may name another one.
        if std::thread::panicking()
            && let Some(pgid) = self.pgid.and_then(Pid::from_raw)
        {
            let _ = kill_process_group(pgid, Signal::KILL);
        }
    }
}

/// True once no process is left in the group, within 2 s.
fn group_gone(pgid: i32) -> bool {
    let Some(pgid) = Pid::from_raw(pgid) else {
        return false;
    };
    let until = Instant::now() + Duration::from_secs(2);
    loop {
        if test_kill_process_group(pgid) == Err(Errno::SRCH) {
            return true;
        }
        if Instant::now() >= until {
            return false;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}

/// Whether any process has `needle` as its command line.
fn process_running(needle: &str) -> bool {
    std::fs::read_dir("/proc").is_ok_and(|entries| {
        entries.flatten().any(|entry| {
            std::fs::read(entry.path().join("cmdline")).is_ok_and(|bytes| {
                let line = String::from_utf8_lossy(&bytes).replace('\0', " ");
                line.trim() == needle
            })
        })
    })
}

/// A `run` host given `signal` while its run is in flight: the run returns `Abort`, the host
/// reports the signal and exits `128 + number` within 3 s, and nothing of the run is left.
fn forwards(signal: &str, number: i32, seconds: &str) {
    let mut host = Host::start("run", seconds);
    let pgid: i32 = host.wait_for("started ").parse().unwrap();
    host.pgid = Some(pgid);
    let sent = Instant::now();
    host.signal(signal);
    let status = host.exit_within(Duration::from_secs(3));
    assert!(status.is_some(), "still running 3 s after SIG{signal}");
    assert_eq!(status.and_then(|s| s.code()), Some(128 + number));
    assert!(sent.elapsed() < Duration::from_secs(3));
    assert_eq!(
        host.rest(),
        [
            "reason Some(Abort)".to_owned(),
            format!("signal Some({number})")
        ]
    );
    assert!(group_gone(pgid), "the run's group is still there");
    if cfg!(target_os = "linux") {
        assert!(!process_running(&format!("sleep {seconds}")));
    }
}

#[test]
fn a_signal_stops_every_group() {
    forwards("INT", 2, "31");
}

#[test]
fn sigterm_and_sighup_are_forwarded_too() {
    forwards("TERM", 15, "32");
    forwards("HUP", 1, "32");
}

#[test]
fn a_second_signal_ends_the_host() {
    for (signal, number) in [("INT", 2), ("TERM", 15), ("HUP", 1)] {
        let mut host = Host::start("wait", "");
        host.wait_for("ready");
        host.signal(signal);
        assert_eq!(host.wait_for("forwarded "), number.to_string());
        assert!(
            host.exit_within(Duration::from_millis(300)).is_none(),
            "ended by the first SIG{signal}"
        );
        host.signal(signal);
        let status = host.exit_within(Duration::from_secs(3));
        assert!(status.is_some(), "still running after a second SIG{signal}");
        assert_eq!(status.and_then(|s| s.code()), None);
        assert_eq!(status.and_then(|s| s.signal()), Some(number));
    }
}

#[test]
fn without_the_call_a_signal_ends_the_host() {
    let mut host = Host::start("wait-without-call", "");
    host.wait_for("ready");
    host.signal("INT");
    let status = host.exit_within(Duration::from_secs(3));
    assert!(status.is_some(), "still running after SIGINT");
    assert_eq!(status.and_then(|s| s.signal()), Some(2));
}

#[test]
fn every_handle_is_stopped_and_one_added_after_the_signal_at_once() {
    let mut host = Host::start("handles", "");
    host.wait_for("ready");
    host.signal("TERM");
    let status = host.exit_within(Duration::from_secs(3));
    assert_eq!(status.and_then(|s| s.code()), Some(143), "{status:?}");
    assert_eq!(
        host.rest(),
        [
            "stopped true true true".to_owned(),
            "signals Some(15) Some(15) Some(15)".to_owned()
        ]
    );
}

#[cfg(target_os = "linux")]
#[test]
fn a_signal_ignored_at_the_call_stays_ignored() {
    let mut host = Host::start_ignoring("wait", "", Some("HUP"));
    host.wait_for("ready");
    host.signal("HUP");
    assert!(
        host.exit_within(Duration::from_millis(300)).is_none(),
        "ended by an ignored SIGHUP"
    );
    // SIGINT is still forwarded, and a SIGHUP after it is still ignored.
    host.signal("INT");
    assert_eq!(host.wait_for("forwarded "), "2");
    host.signal("HUP");
    assert!(
        host.exit_within(Duration::from_millis(300)).is_none(),
        "ended by an ignored SIGHUP after SIGINT"
    );
}
