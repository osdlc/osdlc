//! The sharing runtime an app embeds: load the stored config, start, stop or
//! rebind the server to match it, hold its tokens (read, full, and admin while
//! the config's `admin` is on), and report a
//! status for the settings UI. The app supplies where the config lives
//! ([`ConfigStore`]) and its router; nothing here knows Tauri. The host's
//! interfaces, for a listen picker, are [`crate::interfaces`].

use std::path::PathBuf;
use std::sync::{PoisonError, RwLock};

use axum::Router;
use serde::Serialize;
use tokio::sync::Mutex;

use crate::config::{Listen, WebAccessConfig};
use crate::context::Grant;
use crate::guard::{Tokens, TokensError};
use crate::serve::{ServeError, ServeOptions, ServerHandle, serve_opts};
use crate::token;

/// Where an app keeps its [`WebAccessConfig`].
pub trait ConfigStore: Send + Sync {
    /// The stored config; disabled when nothing is stored.
    ///
    /// # Errors
    ///
    /// A message for the status when the store cannot be read.
    fn load(&self) -> Result<WebAccessConfig, String>;
    /// Persist `cfg`.
    ///
    /// # Errors
    ///
    /// A message for the caller when the store cannot be written.
    fn save(&self, cfg: &WebAccessConfig) -> Result<(), String>;
}

/// Why a [`SharingRuntime`] call failed.
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum RuntimeError {
    /// [`ConfigStore::load`] failed.
    #[error("web access config: {0}")]
    Config(String),
    /// [`ConfigStore::save`] failed.
    #[error("saving web access config: {0}")]
    Save(String),
    /// A token file could not be read or written.
    #[error("web-access token: {0}")]
    Token(#[from] std::io::Error),
    /// Two of the tokens differ only in percent-encoding, or are the same
    /// token with different grants (a hand-set token file or override), so
    /// the server was not started.
    #[error("web-access tokens: {0}")]
    Tokens(#[from] TokensError),
    /// The full token comes from an override, so it cannot be rotated.
    #[error("the full token is set by the environment and cannot be rotated")]
    TokenPinned,
    /// Admin access is off, so there is no admin token.
    #[error("admin access is off, so there is no admin token to rotate")]
    AdminOff,
    /// The overriding full token is shorter than
    /// [`SharingRuntime::with_min_override_len`] allows beyond loopback.
    #[error(
        "the full token set by the environment is {len} characters; listening beyond loopback needs at least {min}"
    )]
    WeakToken {
        /// The override's length.
        len: usize,
        /// The shortest length allowed.
        min: usize,
    },
    /// The server did not start.
    #[error(transparent)]
    Serve(#[from] ServeError),
}

/// Share links by what they grant. Each carries its token in `?token=`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[non_exhaustive]
pub struct ShareUrls {
    /// Links with the view-only token, one per reachable address.
    pub read: Vec<String>,
    /// Links with the full token, one per reachable address.
    pub full: Vec<String>,
    /// Empty while [`WebAccessConfig::admin`] is off.
    pub admin: Vec<String>,
}

/// The settings UI's view: the stored config plus the server's state.
/// `listen` keeps the crate's wire shape (`"loopback"`, `"allInterfaces"`,
/// `{"interfaces": [...]}`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[non_exhaustive]
pub struct WebAccessStatus {
    /// The stored `enabled` switch.
    pub enabled: bool,
    /// The stored listen setting.
    pub listen: Listen,
    /// The stored port (0 for any free port).
    pub port: u16,
    /// The stored `admin` switch, so the settings UI can show it while the
    /// server is off (the admin links exist only while it is running).
    pub admin: bool,
    /// Whether the server is running.
    pub running: bool,
    /// The share links of the running server; empty while it is not running.
    pub share_urls: ShareUrls,
    /// Why the server is not running, when it failed to start.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl WebAccessStatus {
    /// The status of `cfg` with no server running: no links and no error.
    /// For a settings surface to show before the runtime has reported, or in
    /// a test. The fields are public, so set any that differ.
    pub fn stopped(cfg: &WebAccessConfig) -> Self {
        Self {
            enabled: cfg.enabled,
            listen: cfg.listen.clone(),
            port: cfg.port,
            admin: cfg.admin,
            running: false,
            share_urls: ShareUrls::default(),
            error: None,
        }
    }

    /// This status with the token removed from every link, for a surface a
    /// remote peer can read: `read` and `full` hold the same plain links. A
    /// remote peer cannot manage sharing, so it is not told whether admin
    /// access is on (`admin` false, no admin links).
    pub fn without_tokens(&self) -> Self {
        let plain: Vec<String> = self
            .share_urls
            .full
            .iter()
            .map(|u| strip_token(u))
            .collect();
        Self {
            admin: false,
            share_urls: ShareUrls {
                read: plain.clone(),
                full: plain,
                admin: Vec::new(),
            },
            ..self.clone()
        }
    }
}

/// The server and its tokens; only `set`, `rotate` and `start_from_store`
/// touch it, under [`SharingRuntime::live`].
#[derive(Default)]
struct Live {
    server: Option<ServerHandle>,
}

/// The tokens a server was started with; `admin` only while the config's
/// `admin` is on.
struct StartTokens {
    full: String,
    read: String,
    admin: Option<String>,
}

/// What the last apply left behind, readable without the apply lock.
#[derive(Default)]
struct Snapshot {
    running: bool,
    share_urls: ShareUrls,
    error: Option<String>,
}

/// Owns the config store, the token files, the router factory and the running
/// server. `set`, `rotate` and `start_from_store` hold one lock from loading or
/// saving the config to finishing the apply, so the store and the server cannot
/// diverge. `status` never takes it: it reads the config from the store and the
/// rest from what the last apply left, so it does not wait out a rebind.
pub struct SharingRuntime {
    store: Box<dyn ConfigStore>,
    /// Holds the full token file (`web-access-token` unless renamed),
    /// `web-access-read-token` and, while admin is on, `web-access-admin-token`.
    token_dir: PathBuf,
    full_token_file: String,
    /// A full token set outside the files; wins over the file and is not rotatable.
    full_token_override: Option<String>,
    /// Shortest `full_token_override` accepted on a bind beyond loopback.
    min_override_len: usize,
    /// Called once per start: a rebind builds a fresh router.
    build_router: Box<dyn Fn() -> Router + Send + Sync>,
    options: ServeOptions,
    live: Mutex<Live>,
    snapshot: RwLock<Snapshot>,
}

impl SharingRuntime {
    /// A runtime that reads and writes its config through `store`, keeps its
    /// token files in `token_dir`, and calls `build_router` for each start.
    /// Nothing runs until [`Self::start_from_store`] or [`Self::set`].
    pub fn new(
        store: impl ConfigStore + 'static,
        token_dir: PathBuf,
        build_router: impl Fn() -> Router + Send + Sync + 'static,
    ) -> Self {
        Self {
            store: Box::new(store),
            token_dir,
            full_token_file: token::TOKEN_FILE.to_owned(),
            full_token_override: None,
            min_override_len: 0,
            build_router: Box::new(build_router),
            options: ServeOptions::default(),
            live: Mutex::new(Live::default()),
            snapshot: RwLock::new(Snapshot::default()),
        }
    }

    /// Keep the full token in `file_name` inside the token dir, for an app
    /// whose install already has a token file of its own name.
    #[must_use]
    pub fn with_full_token_file(mut self, file_name: impl Into<String>) -> Self {
        self.full_token_file = file_name.into();
        self
    }

    /// Use `token` as the full token when it is non-blank (an env override);
    /// nothing is written for it and [`Self::rotate`] refuses `Grant::Full`.
    #[must_use]
    pub fn with_full_token_override(mut self, token: Option<String>) -> Self {
        self.full_token_override = token.filter(|t| !t.trim().is_empty());
        self
    }

    /// Refuse to listen beyond loopback while the overriding full token is
    /// shorter than `len`: a hand-typed weak token is the only guard there.
    #[must_use]
    pub fn with_min_override_len(mut self, len: usize) -> Self {
        self.min_override_len = len;
        self
    }

    /// The guard inputs every start uses.
    #[must_use]
    pub fn with_options(mut self, options: ServeOptions) -> Self {
        self.options = options;
        self
    }

    /// Startup: apply the stored config. A failed start is reported in the
    /// status's `error`; only an unreadable config is an `Err`.
    ///
    /// # Errors
    ///
    /// [`RuntimeError::Config`] when the stored config cannot be read. A server that fails to
    /// start is reported in the status, not as an error.
    pub async fn start_from_store(&self) -> Result<WebAccessStatus, RuntimeError> {
        let mut live = self.live.lock().await;
        let cfg = self.load()?;
        self.apply(&mut live, &cfg).await;
        Ok(self.status_of(&cfg))
    }

    /// The stored config and the last apply's outcome. Never waits for an
    /// apply in flight: the config may already be the new one while the
    /// server fields still describe the old.
    ///
    /// # Errors
    ///
    /// [`RuntimeError::Config`] when the stored config cannot be read.
    pub fn status(&self) -> Result<WebAccessStatus, RuntimeError> {
        Ok(self.status_of(&self.load()?))
    }

    /// Persist `cfg`, then make the server match it. Always a stop-then-start,
    /// so a changed port or listen address takes effect. A failed start leaves
    /// the setting saved and nothing running, with the reason in `error`.
    ///
    /// # Errors
    ///
    /// [`RuntimeError::Save`] when the config cannot be stored. A server that fails to start is
    /// reported in the status, not as an error.
    pub async fn set(&self, cfg: WebAccessConfig) -> Result<WebAccessStatus, RuntimeError> {
        let mut live = self.live.lock().await;
        self.store.save(&cfg).map_err(RuntimeError::Save)?;
        self.apply(&mut live, &cfg).await;
        Ok(self.status_of(&cfg))
    }

    /// Mint a new token for `grant` and restart so it takes effect; the old
    /// token's links and cookies stop working and the other grants' keep
    /// working. A no-op while web access is disabled. [`Grant::Admin`] works
    /// only while the config's `admin` is on, else [`RuntimeError::AdminOff`].
    ///
    /// # Errors
    ///
    /// [`RuntimeError::TokenPinned`] for the full token while an override is set,
    /// [`RuntimeError::AdminOff`] for the admin token while admin is off,
    /// [`RuntimeError::Config`] when the stored config cannot be read, and
    /// [`RuntimeError::Token`] when the new token cannot be written.
    pub async fn rotate(&self, grant: Grant) -> Result<WebAccessStatus, RuntimeError> {
        if grant == Grant::Full && self.full_token_override.is_some() {
            return Err(RuntimeError::TokenPinned);
        }
        let mut live = self.live.lock().await;
        let cfg = self.load()?;
        if grant == Grant::Admin && !cfg.admin {
            return Err(RuntimeError::AdminOff);
        }
        if cfg.enabled {
            match grant {
                Grant::Full => token::rotate_named(&self.token_dir, &self.full_token_file)?,
                Grant::Read => token::rotate_read(&self.token_dir)?,
                Grant::Admin => token::rotate_admin(&self.token_dir)?,
            };
            self.apply(&mut live, &cfg).await;
        }
        Ok(self.status_of(&cfg))
    }

    fn load(&self) -> Result<WebAccessConfig, RuntimeError> {
        self.store.load().map_err(RuntimeError::Config)
    }

    /// Stop what is running, then start for `cfg` when it is enabled, and
    /// publish the outcome to the snapshot.
    async fn apply(&self, live: &mut Live, cfg: &WebAccessConfig) {
        if let Some(running) = live.server.take() {
            running.stop().await;
        }
        let mut snap = Snapshot::default();
        // Admin off forgets the token whether or not sharing runs, so turning
        // admin on again (now or after sharing restarts) mints a fresh one
        // rather than reviving links an earlier session handed out.
        if !cfg.admin
            && let Err(e) = token::forget_admin(&self.token_dir)
        {
            snap.error = Some(e.to_string());
        }
        if cfg.enabled && snap.error.is_none() {
            match self.start(cfg).await {
                Ok((handle, tokens)) => {
                    snap.running = true;
                    snap.share_urls = ShareUrls {
                        read: handle.share_urls_for(&tokens.read),
                        full: handle.share_urls_for(&tokens.full),
                        admin: tokens
                            .admin
                            .as_deref()
                            .map(|t| handle.share_urls_for(t))
                            .unwrap_or_default(),
                    };
                    live.server = Some(handle);
                }
                Err(e) => snap.error = Some(e.to_string()),
            }
        }
        *self
            .snapshot
            .write()
            .unwrap_or_else(PoisonError::into_inner) = snap;
    }

    async fn start(
        &self,
        cfg: &WebAccessConfig,
    ) -> Result<(ServerHandle, StartTokens), RuntimeError> {
        if let Some(t) = self.full_token_override.as_deref().map(str::trim)
            && !cfg.listen.is_loopback_only()
            && t.len() < self.min_override_len
        {
            return Err(RuntimeError::WeakToken {
                len: t.len(),
                min: self.min_override_len,
            });
        }
        let full = token::resolve_named(
            &self.token_dir,
            &self.full_token_file,
            self.full_token_override.as_deref(),
        )?;
        let read = token::load_or_mint_read(&self.token_dir)?;
        // Loaded only while admin is on: off, the guard never holds it, so
        // presenting it grants nothing (`apply` has already removed the file).
        let admin = if cfg.admin {
            Some(token::load_or_mint_admin(&self.token_dir)?)
        } else {
            None
        };
        let mut tokens = Tokens::full_only(full.clone()).with(read.clone(), Grant::Read)?;
        if let Some(a) = &admin {
            tokens = tokens.with(a.clone(), Grant::Admin)?;
        }
        let handle = serve_opts((self.build_router)(), cfg, tokens, self.options.clone()).await?;
        Ok((handle, StartTokens { full, read, admin }))
    }

    fn status_of(&self, cfg: &WebAccessConfig) -> WebAccessStatus {
        let snap = self.snapshot.read().unwrap_or_else(PoisonError::into_inner);
        let mut status = WebAccessStatus::stopped(cfg);
        status.running = snap.running;
        status.share_urls = snap.share_urls.clone();
        status.error = snap.error.clone();
        status
    }
}

/// `url` without its `token` query parameter.
fn strip_token(url: &str) -> String {
    let Some((base, query)) = url.split_once('?') else {
        return url.to_owned();
    };
    match crate::guard::split_token_param(query) {
        Some((_, rest)) if rest.is_empty() => base.to_owned(),
        Some((_, rest)) => format!("{base}?{rest}"),
        None => url.to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::sync::Mutex as StdMutex;

    use super::*;

    #[derive(Clone, Default)]
    struct MemStore(Arc<StdMutex<Option<WebAccessConfig>>>);

    impl ConfigStore for MemStore {
        fn load(&self) -> Result<WebAccessConfig, String> {
            Ok(self.0.lock().unwrap().clone().unwrap_or_default())
        }
        fn save(&self, cfg: &WebAccessConfig) -> Result<(), String> {
            *self.0.lock().unwrap() = Some(cfg.clone());
            Ok(())
        }
    }

    fn cfg(enabled: bool) -> WebAccessConfig {
        WebAccessConfig {
            enabled,
            listen: Listen::Loopback,
            port: 0,
            admin: false,
        }
    }

    fn cfg_admin() -> WebAccessConfig {
        WebAccessConfig {
            admin: true,
            ..cfg(true)
        }
    }

    fn runtime(dir: &tempfile::TempDir, store: MemStore) -> SharingRuntime {
        SharingRuntime::new(store, dir.path().to_path_buf(), || {
            Router::new().route("/api/ping", axum::routing::get(|| async { "pong" }))
        })
    }

    fn token_of(url: &str) -> &str {
        url.split("?token=").nth(1).unwrap()
    }

    #[tokio::test]
    async fn set_starts_rebinds_and_stops_and_persists() {
        let dir = tempfile::tempdir().unwrap();
        let store = MemStore::default();
        let rt = runtime(&dir, store.clone());

        let up = rt.set(cfg(true)).await.unwrap();
        assert!(up.running, "{up:?}");
        assert!(store.load().unwrap().enabled);
        let first = up.share_urls.full[0].clone();

        // Same config again rebinds, still serving with the same tokens.
        let again = rt.set(cfg(true)).await.unwrap();
        assert!(again.running);
        assert_eq!(token_of(&again.share_urls.full[0]), token_of(&first));

        let down = rt.set(cfg(false)).await.unwrap();
        assert!(!down.enabled && !down.running);
        assert_eq!(down.share_urls, ShareUrls::default());
        assert!(!store.load().unwrap().enabled);
    }

    #[tokio::test]
    async fn start_from_store_applies_the_stored_config() {
        let dir = tempfile::tempdir().unwrap();
        let store = MemStore::default();
        let rt = runtime(&dir, store.clone());
        assert!(!rt.start_from_store().await.unwrap().running);

        store.save(&cfg(true)).unwrap();
        let up = rt.start_from_store().await.unwrap();
        assert!(up.running);
        rt.set(cfg(false)).await.unwrap();
    }

    #[tokio::test]
    async fn status_carries_a_link_per_grant_with_different_tokens() {
        let dir = tempfile::tempdir().unwrap();
        let rt = runtime(&dir, MemStore::default());
        let up = rt.set(cfg(true)).await.unwrap();
        let full = token::load_or_mint(dir.path()).unwrap();
        let read = token::load_or_mint_read(dir.path()).unwrap();
        assert!(up.share_urls.full.iter().all(|u| token_of(u) == full));
        assert!(up.share_urls.read.iter().all(|u| token_of(u) == read));
        assert!(!up.share_urls.read.is_empty());
        rt.set(cfg(false)).await.unwrap();
    }

    #[tokio::test]
    async fn rotate_read_changes_only_the_read_token() {
        let dir = tempfile::tempdir().unwrap();
        let rt = runtime(&dir, MemStore::default());
        let before = rt.set(cfg(true)).await.unwrap();
        let tokens = |s: &WebAccessStatus| {
            (
                token_of(&s.share_urls.full[0]).to_owned(),
                token_of(&s.share_urls.read[0]).to_owned(),
            )
        };
        let (full, read) = tokens(&before);

        let after = rt.rotate(Grant::Read).await.unwrap();
        assert!(after.running);
        let (full2, read2) = tokens(&after);
        assert_eq!(full2, full);
        assert_ne!(read2, read);

        let rotated = rt.rotate(Grant::Full).await.unwrap();
        let (full3, read3) = tokens(&rotated);
        assert_ne!(full3, full);
        assert_eq!(read3, read2);
        rt.set(cfg(false)).await.unwrap();
    }

    #[tokio::test]
    async fn a_renamed_or_overridden_full_token_is_what_the_links_carry() {
        let dir = tempfile::tempdir().unwrap();
        let rt = runtime(&dir, MemStore::default()).with_full_token_file("token");
        let up = rt.set(cfg(true)).await.unwrap();
        let on_disk = token::load_or_mint_named(dir.path(), "token").unwrap();
        assert!(up.share_urls.full.iter().all(|u| token_of(u) == on_disk));
        assert!(!dir.path().join(token::TOKEN_FILE).exists());

        let pinned =
            runtime(&dir, MemStore::default()).with_full_token_override(Some("env-tok".into()));
        let up = pinned.set(cfg(true)).await.unwrap();
        assert!(up.share_urls.full.iter().all(|u| token_of(u) == "env-tok"));
        assert!(matches!(
            pinned.rotate(Grant::Full).await,
            Err(RuntimeError::TokenPinned)
        ));
        assert!(pinned.rotate(Grant::Read).await.is_ok());
        pinned.set(cfg(false)).await.unwrap();
    }

    #[tokio::test]
    async fn a_blank_override_is_not_pinned_and_a_weak_one_is_refused_beyond_loopback() {
        let dir = tempfile::tempdir().unwrap();
        let blank = runtime(&dir, MemStore::default()).with_full_token_override(Some("  ".into()));
        assert!(blank.rotate(Grant::Full).await.is_ok(), "blank is unset");

        let weak = runtime(&dir, MemStore::default())
            .with_full_token_override(Some("short".into()))
            .with_min_override_len(32);
        assert!(
            weak.set(cfg(true)).await.unwrap().running,
            "loopback accepts it"
        );
        let mut lan = cfg(true);
        lan.listen = Listen::AllInterfaces;
        let status = weak.set(lan).await.unwrap();
        assert!(!status.running);
        assert!(status.error.unwrap().contains("at least 32"));
        weak.set(cfg(false)).await.unwrap();
    }

    #[tokio::test]
    async fn admin_off_publishes_no_admin_links_and_mints_no_token() {
        let dir = tempfile::tempdir().unwrap();
        let rt = runtime(&dir, MemStore::default());
        let up = rt.set(cfg(true)).await.unwrap();
        assert!(up.share_urls.admin.is_empty());
        assert!(!dir.path().join(token::ADMIN_TOKEN_FILE).exists());
        assert!(matches!(
            rt.rotate(Grant::Admin).await,
            Err(RuntimeError::AdminOff)
        ));
        rt.set(cfg(false)).await.unwrap();
    }

    #[tokio::test]
    async fn admin_on_publishes_links_rotates_and_off_forgets_the_token() {
        let dir = tempfile::tempdir().unwrap();
        let rt = runtime(&dir, MemStore::default());
        let up = rt.set(cfg_admin()).await.unwrap();
        let admin = token::load_or_mint_admin(dir.path()).unwrap();
        assert!(!up.share_urls.admin.is_empty());
        assert!(up.share_urls.admin.iter().all(|u| token_of(u) == admin));
        let full = token::load_or_mint(dir.path()).unwrap();
        assert_ne!(admin, full);

        let rotated = rt.rotate(Grant::Admin).await.unwrap();
        let admin2 = token_of(&rotated.share_urls.admin[0]).to_owned();
        assert_ne!(admin2, admin);
        assert_eq!(token_of(&rotated.share_urls.full[0]), full);

        let plain = rotated.without_tokens();
        assert!(plain.share_urls.admin.is_empty() && !plain.admin);
        assert!(!serde_json::to_string(&plain).unwrap().contains("token"));

        // Off removes the file; on again mints a different token.
        let off = rt.set(cfg(true)).await.unwrap();
        assert!(off.share_urls.admin.is_empty());
        assert!(!dir.path().join(token::ADMIN_TOKEN_FILE).exists());
        let back = rt.set(cfg_admin()).await.unwrap();
        assert_ne!(token_of(&back.share_urls.admin[0]), admin2);
        rt.set(cfg(false)).await.unwrap();
    }

    #[tokio::test]
    async fn admin_off_while_sharing_is_off_still_forgets_the_token() {
        let dir = tempfile::tempdir().unwrap();
        let rt = runtime(&dir, MemStore::default());
        let up = rt.set(cfg_admin()).await.unwrap();
        let old = token_of(&up.share_urls.admin[0]).to_owned();
        // Sharing off with admin still on keeps the token for the next start...
        let paused = WebAccessConfig {
            enabled: false,
            ..cfg_admin()
        };
        rt.set(paused).await.unwrap();
        assert!(dir.path().join(token::ADMIN_TOKEN_FILE).exists());
        // ...but admin off, even with sharing off, forgets it.
        rt.set(cfg(false)).await.unwrap();
        assert!(!dir.path().join(token::ADMIN_TOKEN_FILE).exists());
        let back = rt.set(cfg_admin()).await.unwrap();
        assert_ne!(token_of(&back.share_urls.admin[0]), old);
        rt.set(cfg(false)).await.unwrap();
    }

    #[tokio::test]
    async fn rotate_while_disabled_mints_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let rt = runtime(&dir, MemStore::default());
        let status = rt.rotate(Grant::Read).await.unwrap();
        assert!(!status.enabled && !status.running);
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);
    }

    #[tokio::test]
    async fn colliding_hand_set_tokens_are_refused_and_nothing_runs() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(token::READ_TOKEN_FILE), "a b").unwrap();
        let rt = runtime(&dir, MemStore::default()).with_full_token_override(Some("a%20b".into()));
        let status = rt.set(cfg(true)).await.unwrap();
        assert!(status.enabled && !status.running);
        assert!(status.share_urls.read.is_empty());
        assert!(
            status.error.unwrap().contains("percent-encoding"),
            "names the collision"
        );
    }

    /// Matching hand-set read and admin files would make the Read link an
    /// Admin credential, so the set is refused.
    #[tokio::test]
    async fn the_same_hand_set_token_for_read_and_admin_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(token::READ_TOKEN_FILE), "same-token").unwrap();
        std::fs::write(dir.path().join(token::ADMIN_TOKEN_FILE), "same-token").unwrap();
        let rt = runtime(&dir, MemStore::default());
        let status = rt.set(cfg_admin()).await.unwrap();
        assert!(status.enabled && !status.running);
        assert!(status.share_urls.read.is_empty() && status.share_urls.admin.is_empty());
        let error = status.error.unwrap();
        assert!(error.contains("Read") && error.contains("Admin"), "{error}");
        assert!(!error.contains("same-token"), "{error}");
    }

    #[tokio::test]
    async fn a_failed_bind_is_reported_and_leaves_nothing_running() {
        let dir = tempfile::tempdir().unwrap();
        let rt = runtime(&dir, MemStore::default());
        let taken = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let mut busy = cfg(true);
        busy.port = taken.local_addr().unwrap().port();
        let status = rt.set(busy).await.unwrap();
        assert!(status.enabled && !status.running);
        assert!(status.error.is_some());

        // A corrected config recovers and clears the error.
        let fixed = rt.set(cfg(true)).await.unwrap();
        assert!(fixed.running && fixed.error.is_none(), "{fixed:?}");
        let off = rt.set(cfg(false)).await.unwrap();
        assert!(off.error.is_none());
    }

    #[tokio::test]
    async fn status_serialises_camel_case_and_without_tokens_strips_them() {
        let dir = tempfile::tempdir().unwrap();
        let rt = runtime(&dir, MemStore::default());
        let up = rt.set(cfg(true)).await.unwrap();
        let v = serde_json::to_value(&up).unwrap();
        assert!(
            v["shareUrls"]["read"][0]
                .as_str()
                .unwrap()
                .contains("?token=")
        );
        assert!(v["shareUrls"]["full"].is_array());
        assert_eq!(v["admin"], false);
        assert!(v.get("error").is_none());

        let public = serde_json::to_string(&up.without_tokens()).unwrap();
        assert!(!public.contains("token"), "{public}");
        let plain = up.without_tokens();
        assert!(!plain.share_urls.full.is_empty());
        assert_eq!(plain.share_urls.read, plain.share_urls.full);
        rt.set(cfg(false)).await.unwrap();
    }

    #[tokio::test]
    async fn concurrent_set_and_rotate_leave_store_and_server_in_agreement() {
        let dir = tempfile::tempdir().unwrap();
        let store = MemStore::default();
        let rt = runtime(&dir, store.clone());
        rt.set(cfg(true)).await.unwrap();

        let (a, b, c) = tokio::join!(
            rt.set(cfg(false)),
            rt.rotate(Grant::Read),
            rt.set(cfg(true)),
        );
        a.unwrap();
        b.unwrap();
        c.unwrap();

        // Whatever order they ran in, the server matches the stored config.
        let stored = store.load().unwrap();
        let status = rt.status().unwrap();
        assert_eq!(status.enabled, stored.enabled);
        assert_eq!(status.running, stored.enabled, "{status:?}");
        assert_eq!(status.share_urls.full.is_empty(), !stored.enabled);
        rt.set(cfg(false)).await.unwrap();
    }

    #[test]
    fn strip_token_drops_only_the_token() {
        assert_eq!(
            strip_token("http://192.168.1.2:20001/?token=abc"),
            "http://192.168.1.2:20001/"
        );
        assert_eq!(strip_token("http://h/?a=1&token=abc"), "http://h/?a=1");
        assert_eq!(strip_token("http://h/"), "http://h/");
    }
}
