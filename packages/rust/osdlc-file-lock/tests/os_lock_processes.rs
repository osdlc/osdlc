//! The OS lock between processes: a holder in another process, a holder that
//! is killed, a process frozen with the guard, and many starters at once with
//! processes that only ask.
//!
//! The other processes are this test binary, run again with [`ROLE`] set, so
//! that only the test [`child_process`] runs and plays that role. A child
//! reports on its stdout in lines that start with [`SAYS`], and goes on, or
//! ends, when its stdin gets a line or closes. No test waits a fixed time for
//! another process: each waits for a line.
//!
//! The race runs [`DEFAULT_ROUNDS`] rounds. `OSDLC_FILE_LOCK_RACE_ROUNDS` sets
//! another count, and `--nocapture` shows the counts:
//!
//! ```sh
//! OSDLC_FILE_LOCK_RACE_ROUNDS=100 cargo test -p osdlc-file-lock \
//!   --test os_lock_processes many_starters -- --nocapture
//! ```
#![cfg(any(unix, windows))]

use std::collections::BTreeMap;
use std::fs::{self, File, OpenOptions};
use std::io::{self, BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use osdlc_file_lock::os_lock::{GUARD_WAIT, OsLock, OsLockError, OsLockState, guard_path};

/// The role a child process plays. Not set in a test run.
const ROLE: &str = "OSDLC_FILE_LOCK_TEST_ROLE";
/// The lock a child process works on.
const LOCK: &str = "OSDLC_FILE_LOCK_TEST_LOCK";
/// The start of each line a child reports.
const SAYS: &str = "os-lock-child: ";

/// A record a holder that died left in the lock file. No process of a test
/// has pid 1.
const LEFT_BEHIND: &str = "{\"pid\":1,\"boot\":\"old\",\"started_at\":\"2026-11-01\"}\n";

/// Whether a holder's record can be read here. On Windows the lock blocks the
/// read, so a holder has no name.
fn named() -> bool {
    cfg!(unix)
}

const STARTERS: usize = 24;
const ASKERS: usize = 4;
const DEFAULT_ROUNDS: usize = 4;

// ---- the child's side ----

/// A child process's whole run. In a test run `ROLE` is not set and this does
/// nothing.
#[test]
fn child_process() {
    let Ok(role) = std::env::var(ROLE) else {
        return;
    };
    let path = PathBuf::from(std::env::var_os(LOCK).expect("the lock's path"));
    match role.as_str() {
        "hold" => {
            let taken = OsLock::acquire(&path);
            say(&outcome(&taken));
            wait_for_stdin();
        }
        "hold-guard" => {
            let _guard = hold(&guard_path(&path));
            say("ready");
            wait_for_stdin();
        }
        // As a process stopped in the middle of `acquire`: the guard and the
        // lock, and the record not written.
        "hold-guard-and-lock" => {
            let _guard = hold(&guard_path(&path));
            let _lock = hold(&path);
            say("ready");
            wait_for_stdin();
        }
        "start" => {
            say("ready");
            wait_for_stdin();
            let taken = OsLock::acquire(&path);
            say(&outcome(&taken));
            if taken.is_ok() {
                wait_for_stdin();
            }
        }
        "ask" => ask_until_stdin(&path),
        other => panic!("no such role: {other}"),
    }
    // No destructor runs: what the process holds is let go by the system.
    std::process::exit(0);
}

fn say(line: &str) {
    let mut out = io::stdout().lock();
    writeln!(out, "{SAYS}{line}").unwrap();
    out.flush().unwrap();
}

/// Returns when stdin gets a line or closes.
fn wait_for_stdin() {
    let _ = io::stdin().lock().read_line(&mut String::new());
}

/// A lock of the caller's own on the file at `path`, created when missing.
fn hold(path: &Path) -> File {
    let file = OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(path)
        .unwrap();
    file.try_lock().unwrap();
    file
}

/// How an `acquire` ended, as a child reports it and [`Outcome::parse`] reads it.
fn outcome(taken: &Result<OsLock, OsLockError>) -> String {
    match taken {
        Ok(_) => format!("won {}", std::process::id()),
        Err(OsLockError::Held { holder, .. }) => format!("held {}", holder.pid),
        Err(OsLockError::HeldUnnamed { .. }) => "unnamed".to_owned(),
        Err(OsLockError::GuardBusy { .. }) => "busy".to_owned(),
        Err(other) => format!("error {other}"),
    }
}

/// Asks who holds the lock, over and over, until stdin gets a line or closes.
/// Then asks once more, and reports every answer with its count, and the last
/// one.
fn ask_until_stdin(path: &Path) {
    static STOP: AtomicBool = AtomicBool::new(false);
    std::thread::spawn(|| {
        wait_for_stdin();
        STOP.store(true, Ordering::SeqCst);
    });
    let answer = || match OsLock::holder(path) {
        Ok(OsLockState::Free) => "free".to_owned(),
        Ok(OsLockState::Held(holder)) => format!("held:{}", holder.pid),
        Ok(OsLockState::HeldUnnamed) => "unnamed".to_owned(),
        Ok(OsLockState::GuardBusy) => "busy".to_owned(),
        Ok(other) => format!("error:{other:?}").replace(' ', "_"),
        Err(e) => format!("error:{}", e.to_string().replace(' ', "_")),
    };
    say("ready");
    let mut counts: BTreeMap<String, u64> = BTreeMap::new();
    while !STOP.load(Ordering::SeqCst) {
        *counts.entry(answer()).or_default() += 1;
    }
    let last = answer();
    let counts: Vec<String> = counts.iter().map(|(a, n)| format!("{a}={n}")).collect();
    say(&format!("asked last={last} {}", counts.join(" ")));
}

// ---- the test's side ----

/// A child process in a role. Dropping it kills the process and waits for it,
/// so a failed test leaves none behind.
struct Proc {
    child: Child,
    stdin: Option<ChildStdin>,
    stdout: BufReader<ChildStdout>,
}

impl Proc {
    fn spawn(role: &str, lock: &Path) -> Self {
        let mut child = Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "child_process", "--nocapture"])
            .env(ROLE, role)
            .env(LOCK, lock)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        let stdin = child.stdin.take();
        let stdout = BufReader::new(child.stdout.take().unwrap());
        Proc {
            child,
            stdin,
            stdout,
        }
    }

    fn pid(&self) -> u32 {
        self.child.id()
    }

    /// The next line the child reports, without [`SAYS`].
    fn heard(&mut self) -> String {
        let mut line = String::new();
        loop {
            line.clear();
            let read = self.stdout.read_line(&mut line).unwrap();
            assert!(read > 0, "child {} ended without a report", self.pid());
            if let Some(said) = line.trim_end().strip_prefix(SAYS) {
                return said.to_owned();
            }
        }
    }

    /// Gives the child's stdin a line.
    fn go(&mut self) {
        let stdin = self.stdin.as_mut().unwrap();
        stdin.write_all(b"go\n").unwrap();
        stdin.flush().unwrap();
    }

    /// Closes the child's stdin and waits for the process to end by itself.
    fn finish(mut self) {
        self.stdin = None;
        let status = self.child.wait().unwrap();
        assert!(status.success(), "child {} ended {status}", self.pid());
    }

    /// Kills the process: nothing in it runs again.
    fn kill(mut self) {
        self.child.kill().unwrap();
        self.child.wait().unwrap();
    }

    /// Stops the process with SIGSTOP, as a debugger or a `kill -STOP` would.
    #[cfg(unix)]
    fn freeze(&self) {
        let status = Command::new("kill")
            .args(["-STOP", &self.pid().to_string()])
            .status()
            .unwrap();
        assert!(status.success(), "kill -STOP ended {status}");
    }
}

impl Drop for Proc {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// How one `acquire` in a child ended.
#[derive(Debug, PartialEq)]
enum Outcome {
    Won(u32),
    Held(u32),
    Unnamed,
    Busy,
}

impl Outcome {
    fn parse(said: &str) -> Self {
        let pid = |text: &str| text.parse::<u32>().unwrap();
        match said.split_once(' ') {
            Some(("won", p)) => Outcome::Won(pid(p)),
            Some(("held", p)) => Outcome::Held(pid(p)),
            None if said == "unnamed" => Outcome::Unnamed,
            None if said == "busy" => Outcome::Busy,
            _ => panic!("a child reported: {said}"),
        }
    }
}

/// What a taker or an asker is told while the process `pid` holds the lock
/// with its pid in the file.
fn held_by(pid: u32) -> Outcome {
    if named() {
        Outcome::Held(pid)
    } else {
        Outcome::Unnamed
    }
}

fn refused(taken: Result<OsLock, OsLockError>) -> Outcome {
    Outcome::parse(&outcome(&taken))
}

fn asked(path: &Path) -> Outcome {
    match OsLock::holder(path).unwrap() {
        OsLockState::Held(holder) => Outcome::Held(holder.pid),
        OsLockState::HeldUnnamed => Outcome::Unnamed,
        OsLockState::GuardBusy => Outcome::Busy,
        other => panic!("expected a held lock, got {other:?}"),
    }
}

/// Takes the lock once it is free. A killed process's locks are let go by the
/// system, which can be a moment after the process is gone.
fn acquire_once_free(path: &Path) -> OsLock {
    let deadline = Instant::now() + Duration::from_secs(60);
    loop {
        match OsLock::acquire(path) {
            Ok(lock) => return lock,
            Err(OsLockError::Io { path, source }) => panic!("{}: {source}", path.display()),
            Err(still) => {
                assert!(Instant::now() < deadline, "never free: {still}");
                std::thread::sleep(Duration::from_millis(10));
            }
        }
    }
}

#[test]
fn another_process_holds_the_lock_and_is_named_by_its_pid() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("x.lock");
    fs::write(&path, LEFT_BEHIND).unwrap();
    let mut holder = Proc::spawn("hold", &path);
    assert_eq!(Outcome::parse(&holder.heard()), Outcome::Won(holder.pid()));

    assert_eq!(refused(OsLock::acquire(&path)), held_by(holder.pid()));
    assert_eq!(asked(&path), held_by(holder.pid()));
    let mut second = Proc::spawn("hold", &path);
    assert_eq!(Outcome::parse(&second.heard()), held_by(holder.pid()));
    second.finish();

    // The holder ends without unlocking anything.
    let pid = holder.pid();
    holder.finish();
    let lock = acquire_once_free(&path);
    drop(lock);
    assert_ne!(pid, std::process::id());
    assert_eq!(
        fs::read_to_string(&path).unwrap(),
        format!("{{\"pid\":{}}}\n", std::process::id())
    );
}

#[test]
fn the_lock_of_a_killed_process_is_free_and_its_file_is_taken_over() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("x.lock");
    let mut holder = Proc::spawn("hold", &path);
    let pid = holder.pid();
    assert_eq!(Outcome::parse(&holder.heard()), Outcome::Won(pid));
    assert_eq!(asked(&path), held_by(pid));

    holder.kill();

    let lock = acquire_once_free(&path);
    // The file had the dead holder's record until this one was written.
    assert_eq!(asked(&path), held_by(std::process::id()));
    drop(lock);
    assert_eq!(OsLock::holder(&path).unwrap(), OsLockState::Free);
}

/// A process frozen in the middle of `acquire`, with the guard and the lock
/// and before its record is written. The file still names a dead holder.
/// Nobody may read that name: a taker and an asker wait for the guard and
/// then report it busy.
#[test]
fn a_process_frozen_with_the_guard_and_the_lock_makes_others_report_the_guard_busy() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("x.lock");
    fs::write(&path, LEFT_BEHIND).unwrap();
    let mut frozen = Proc::spawn("hold-guard-and-lock", &path);
    assert_eq!(frozen.heard(), "ready");
    #[cfg(unix)]
    frozen.freeze();

    let started = Instant::now();
    assert_eq!(refused(OsLock::acquire(&path)), Outcome::Busy);
    assert!(started.elapsed() >= GUARD_WAIT, "it did not wait");
    let started = Instant::now();
    assert_eq!(OsLock::holder(&path).unwrap(), OsLockState::GuardBusy);
    assert!(started.elapsed() >= GUARD_WAIT, "it did not wait");

    // Killed, it holds nothing, and the next taker wins.
    frozen.kill();
    let lock = acquire_once_free(&path);
    drop(lock);
    assert_eq!(
        fs::read_to_string(&path).unwrap(),
        format!("{{\"pid\":{}}}\n", std::process::id())
    );
}

/// A process frozen with the guard only, as one stopped before it tried the
/// lock. The lock is free, and a taker still does not try it.
#[test]
fn a_process_frozen_with_the_guard_only_makes_a_taker_leave_the_free_lock() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("x.lock");
    fs::write(&path, LEFT_BEHIND).unwrap();
    let mut frozen = Proc::spawn("hold-guard", &path);
    assert_eq!(frozen.heard(), "ready");
    #[cfg(unix)]
    frozen.freeze();

    assert_eq!(refused(OsLock::acquire(&path)), Outcome::Busy);

    // The lock is free, and its file is as it was.
    drop(hold(&path));
    assert_eq!(fs::read_to_string(&path).unwrap(), LEFT_BEHIND);
    frozen.kill();
    drop(acquire_once_free(&path));
}

/// What one round of the race counted.
#[derive(Debug, Default)]
struct Counts {
    rounds: usize,
    winners: usize,
    losers_named_the_winner: usize,
    losers_unnamed: usize,
    losers_busy: usize,
    asked: u64,
    asked_free: u64,
    asked_named_the_winner: u64,
    asked_unnamed: u64,
    asked_busy: u64,
}

/// Many starters at once on one lock, with processes that only ask, on a
/// fresh folder and on a record a dead holder left.
///
/// What must hold whatever the timing: at most one starter wins; no starter
/// and no asker is given a pid other than the winner's; and where records can
/// be read, a starter that found the lock held is given the winner's pid,
/// never no name. A busy guard depends on how slow the machine is, so it is
/// counted and allowed.
#[test]
fn many_starters_at_once_have_one_winner_and_everyone_names_it() {
    let rounds = std::env::var("OSDLC_FILE_LOCK_RACE_ROUNDS")
        .map_or(DEFAULT_ROUNDS, |rounds| rounds.parse().unwrap());
    let mut total = Counts::default();
    for round in 0..rounds {
        race(round % 2 == 1, &mut total);
    }
    eprintln!("{STARTERS} starters, {ASKERS} askers: {total:?}");
    assert_eq!(total.rounds, rounds);
}

fn race(left_behind: bool, total: &mut Counts) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("x.lock");
    if left_behind {
        fs::write(&path, LEFT_BEHIND).unwrap();
    }
    let mut askers: Vec<Proc> = (0..ASKERS).map(|_| Proc::spawn("ask", &path)).collect();
    let mut starters: Vec<Proc> = (0..STARTERS).map(|_| Proc::spawn("start", &path)).collect();
    for proc in askers.iter_mut().chain(&mut starters) {
        assert_eq!(proc.heard(), "ready");
    }

    // Every starter is up and waits for its line.
    for starter in &mut starters {
        starter.go();
    }
    let outcomes: Vec<Outcome> = starters
        .iter_mut()
        .map(|starter| Outcome::parse(&starter.heard()))
        .collect();

    let winners: Vec<u32> = outcomes
        .iter()
        .filter_map(|outcome| match outcome {
            Outcome::Won(pid) => Some(*pid),
            _ => None,
        })
        .collect();
    let busy = outcomes.iter().filter(|o| **o == Outcome::Busy).count();
    assert!(winners.len() <= 1, "more than one winner: {outcomes:?}");
    assert!(winners.len() == 1 || busy > 0, "no winner: {outcomes:?}");
    let winner = winners.first().copied();
    for outcome in &outcomes {
        match outcome {
            Outcome::Won(_) => total.winners += 1,
            Outcome::Busy => total.losers_busy += 1,
            Outcome::Held(pid) => {
                assert!(named(), "a record was read: {outcomes:?}");
                assert_eq!(Some(*pid), winner, "a loser named another: {outcomes:?}");
                total.losers_named_the_winner += 1;
            }
            Outcome::Unnamed => {
                assert!(!named(), "a loser was given no name: {outcomes:?}");
                total.losers_unnamed += 1;
            }
        }
    }

    // The askers stop while the winner still holds the lock, so each one's
    // last question was asked of a held lock.
    for asker in &mut askers {
        asker.go();
    }
    for asker in &mut askers {
        let said = asker.heard();
        let mut answers = said.strip_prefix("asked ").unwrap().split(' ');
        let last = answers.next().unwrap().strip_prefix("last=").unwrap();
        if let Some(winner) = winner {
            let held = if named() {
                format!("held:{winner}")
            } else {
                "unnamed".to_owned()
            };
            assert!(last == held || last == "busy", "last answer: {said}");
        }
        for answer in answers {
            let (answer, count) = answer.split_once('=').unwrap();
            let count: u64 = count.parse().unwrap();
            total.asked += count;
            match answer.split_once(':') {
                None if answer == "free" => total.asked_free += count,
                None if answer == "busy" => total.asked_busy += count,
                None if answer == "unnamed" => {
                    assert!(!named(), "an asker was given no name: {said}");
                    total.asked_unnamed += count;
                }
                Some(("held", pid)) => {
                    assert!(named(), "a record was read: {said}");
                    assert_eq!(pid.parse().ok(), winner, "an asker named another: {said}");
                    total.asked_named_the_winner += count;
                }
                _ => panic!("an asker reported: {said}"),
            }
        }
    }

    for proc in askers.into_iter().chain(starters) {
        proc.finish();
    }
    total.rounds += 1;
}
