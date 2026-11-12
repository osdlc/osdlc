//! The connections a server holds open, each with its own cut switch.
//!
//! axum runs each connection in its own task, and an upgraded connection (a
//! WebSocket) leaves the HTTP layer altogether. Neither aborting the serve
//! task nor refusing the next request ends them. Failing their reads and
//! writes does, so every accepted stream is a [`CutStream`] that fails once
//! its [`Conn`] is cut.
//!
//! The guard tags a connection with the id of the token that admitted the
//! request on it. Withdrawing a token cuts the connections tagged with it and
//! leaves the others open. Stopping the server cuts them all.

use std::convert::Infallible;
use std::future::Future;
use std::io;
use std::net::SocketAddr;
use std::pin::Pin;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, PoisonError, Weak};
use std::task::{Context, Poll};

use axum::extract::FromRequestParts;
use axum::extract::connect_info::Connected;
use axum::http::request::Parts;
use axum::serve::{IncomingStream, Listener};
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::watch;

/// One accepted connection.
pub(crate) struct Conn {
    cut: watch::Sender<bool>,
    /// The id of the token entry that admitted the latest request on this
    /// connection; 0 for none (ids start at 1). HTTP/1 carries one request at
    /// a time, so a stream or an upgraded socket runs under this one.
    tag: AtomicU64,
}

impl Conn {
    fn new(cut: bool) -> Self {
        Self {
            cut: watch::Sender::new(cut),
            tag: AtomicU64::new(0),
        }
    }

    /// Record that the token entry `id` admitted the request now on this
    /// connection.
    pub(crate) fn tag(&self, id: u64) {
        self.tag.store(id, Ordering::SeqCst);
    }

    fn cut(&self) {
        self.cut.send_replace(true);
    }

    fn tagged_with_any(&self, ids: &[u64]) -> bool {
        ids.contains(&self.tag.load(Ordering::SeqCst))
    }

    pub(crate) fn signal(&self) -> ConnectionCut {
        ConnectionCut(Some(self.cut.subscribe()))
    }
}

/// The open connections of one server.
#[derive(Default)]
pub(crate) struct Connections(Mutex<Open>);

#[derive(Default)]
struct Open {
    /// A connection is dropped once its stream and every request on it are.
    conns: Vec<Weak<Conn>>,
    /// Set by [`Connections::cut_all`]; a connection accepted later starts cut.
    closed: bool,
}

impl Connections {
    fn open(&self) -> std::sync::MutexGuard<'_, Open> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn register(&self) -> Arc<Conn> {
        let mut open = self.open();
        open.conns.retain(|c| c.strong_count() > 0);
        let conn = Arc::new(Conn::new(open.closed));
        open.conns.push(Arc::downgrade(&conn));
        conn
    }

    fn live(&self) -> Vec<Arc<Conn>> {
        self.open().conns.iter().filter_map(Weak::upgrade).collect()
    }

    /// Cut every connection open now or accepted later.
    pub(crate) fn cut_all(&self) {
        self.open().closed = true;
        for c in self.live() {
            c.cut();
        }
    }

    /// Cut every connection tagged with one of `ids`.
    pub(crate) fn cut_tagged(&self, ids: &[u64]) {
        if ids.is_empty() {
            return;
        }
        for c in self.live() {
            if c.tagged_with_any(ids) {
                c.cut();
            }
        }
    }
}

/// What `serve` hands axum as the connection info: the peer address and the
/// connection. A layer outside the guard splits it into the usual
/// `ConnectInfo<SocketAddr>` and an `Arc<Conn>` extension.
#[derive(Clone)]
pub(crate) struct Peer {
    pub(crate) addr: SocketAddr,
    pub(crate) conn: Arc<Conn>,
}

impl Connected<IncomingStream<'_, CutListener>> for Peer {
    fn connect_info(stream: IncomingStream<'_, CutListener>) -> Self {
        Self {
            addr: *stream.remote_addr(),
            conn: stream.io().conn.clone(),
        }
    }
}

/// A [`TcpListener`] that registers each connection it accepts.
pub(crate) struct CutListener {
    pub(crate) inner: TcpListener,
    pub(crate) conns: Arc<Connections>,
}

impl Listener for CutListener {
    type Io = CutStream;
    type Addr = SocketAddr;

    async fn accept(&mut self) -> (Self::Io, Self::Addr) {
        let (io, addr) = Listener::accept(&mut self.inner).await;
        let conn = self.conns.register();
        let stream = CutStream {
            io,
            read_cut: Box::pin(fired(conn.cut.subscribe())),
            write_cut: Box::pin(fired(conn.cut.subscribe())),
            conn,
        };
        (stream, addr)
    }

    fn local_addr(&self) -> io::Result<Self::Addr> {
        self.inner.local_addr()
    }
}

type CutSignal = Pin<Box<dyn Future<Output = ()> + Send>>;

/// Ready once `cut` turns true, or once its [`Conn`] is dropped. A
/// [`CutStream`] holds its `Conn`, so for the stream only a cut fires it.
async fn fired(mut cut: watch::Receiver<bool>) {
    let _ = cut.wait_for(|c| *c).await;
}

/// One connection of a [`CutListener`].
///
/// Reads and writes poll separate signals, so each keeps its own waker. A
/// connection split into a reader task and a writer task then wakes both.
pub(crate) struct CutStream {
    io: TcpStream,
    read_cut: CutSignal,
    write_cut: CutSignal,
    conn: Arc<Conn>,
}

/// An error once `conn` is cut. Otherwise `signal` is polled, which registers
/// the waker, so a read or write that is waiting is woken to see the cut. A
/// signal that has fired is never polled again: the flag is checked first.
fn check(conn: &Conn, signal: &mut CutSignal, cx: &mut Context<'_>) -> io::Result<()> {
    if *conn.cut.borrow() || signal.as_mut().poll(cx).is_ready() {
        return Err(io::ErrorKind::ConnectionAborted.into());
    }
    Ok(())
}

impl AsyncRead for CutStream {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        let this = &mut *self;
        check(&this.conn, &mut this.read_cut, cx)?;
        Pin::new(&mut self.io).poll_read(cx, buf)
    }
}

impl AsyncWrite for CutStream {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<io::Result<usize>> {
        let this = &mut *self;
        check(&this.conn, &mut this.write_cut, cx)?;
        Pin::new(&mut self.io).poll_write(cx, buf)
    }

    fn poll_write_vectored(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        bufs: &[io::IoSlice<'_>],
    ) -> Poll<io::Result<usize>> {
        let this = &mut *self;
        check(&this.conn, &mut this.write_cut, cx)?;
        Pin::new(&mut self.io).poll_write_vectored(cx, bufs)
    }

    fn is_write_vectored(&self) -> bool {
        self.io.is_write_vectored()
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        let this = &mut *self;
        check(&this.conn, &mut this.write_cut, cx)?;
        Pin::new(&mut self.io).poll_flush(cx)
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.io).poll_shutdown(cx)
    }
}

/// Fires when the server cuts the connection a request arrived on: its token
/// was withdrawn ([`crate::ServerHandle::replace_tokens`], or a
/// [`crate::SharingRuntime`] rotation, admin or sharing turned off), or the
/// server stopped.
///
/// Once cut, every read and write on the connection fails, so a handler that
/// owns an upgraded connection sees an error on its next read or write anyway.
/// Wait on this to end work the handler runs apart from the socket, such as a
/// terminal session it feeds.
///
/// The guard puts it on every request it admits. Extract it as a handler
/// argument; it never rejects. Behind a guard that `serve` did not start,
/// there is nothing to cut and it never fires.
#[derive(Debug, Clone)]
pub struct ConnectionCut(Option<watch::Receiver<bool>>);

impl ConnectionCut {
    /// True once the connection has been cut.
    pub fn is_cut(&self) -> bool {
        self.0.as_ref().is_some_and(|rx| *rx.borrow())
    }

    /// Resolves once the connection is cut, or once it is gone (closed by the
    /// peer, and dropped by every handler that held it). Cancel-safe.
    pub async fn wait(&self) {
        match &self.0 {
            Some(rx) => fired(rx.clone()).await,
            None => std::future::pending().await,
        }
    }
}

impl<S: Send + Sync> FromRequestParts<S> for ConnectionCut {
    type Rejection = Infallible;

    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Self, Infallible> {
        Ok(parts
            .extensions
            .get::<Self>()
            .cloned()
            .unwrap_or(Self(None)))
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    use super::*;

    async fn accept_one(l: &mut CutListener) -> (TcpStream, CutStream) {
        let addr = l.local_addr().unwrap();
        let (client, accepted) = tokio::join!(TcpStream::connect(addr), l.accept());
        (client.unwrap(), accepted.0)
    }

    fn listener(l: TcpListener) -> CutListener {
        CutListener {
            inner: l,
            conns: Arc::default(),
        }
    }

    #[tokio::test]
    async fn a_cut_stream_keeps_failing_without_a_panic() {
        let mut cl = listener(TcpListener::bind("127.0.0.1:0").await.unwrap());
        let (_client, mut io) = accept_one(&mut cl).await;
        cl.conns.cut_all();
        let mut buf = [0u8; 8];
        let aborted = |e: std::io::Error| e.kind() == std::io::ErrorKind::ConnectionAborted;
        assert!(io.read(&mut buf).await.is_err_and(aborted));
        // hyper writes a reply (or a WebSocket a Close frame) after a read error.
        assert!(io.write(b"x").await.is_err_and(aborted));
        assert!(io.flush().await.is_err_and(aborted));
        assert!(io.read(&mut buf).await.is_err_and(aborted));
    }

    /// A connection split across a reader task and a writer task: the cut must
    /// wake the reader even after the writer polled last.
    #[tokio::test]
    async fn a_cut_wakes_both_halves_of_a_split_connection() {
        let mut cl = listener(TcpListener::bind("127.0.0.1:0").await.unwrap());
        let (_client, io) = accept_one(&mut cl).await;
        let (mut rd, mut wr) = tokio::io::split(io);
        let reader = tokio::spawn(async move { rd.read(&mut [0u8; 8]).await });
        tokio::time::sleep(Duration::from_millis(50)).await;
        let (wrote_tx, wrote_rx) = tokio::sync::oneshot::channel();
        let writer = tokio::spawn(async move {
            wr.write_all(b"x").await.unwrap();
            let _ = wrote_tx.send(());
            std::future::pending::<()>().await;
        });
        wrote_rx.await.unwrap();

        cl.conns.cut_all();
        let read = tokio::time::timeout(Duration::from_secs(2), reader).await;
        writer.abort();
        let read = read
            .expect("the reader stayed parked after the cut")
            .unwrap();
        assert!(read.is_err_and(|e| e.kind() == std::io::ErrorKind::ConnectionAborted));
    }

    #[tokio::test]
    async fn cut_tagged_cuts_only_the_tagged_connection() {
        let mut cl = listener(TcpListener::bind("127.0.0.1:0").await.unwrap());
        let (_c1, mut tagged) = accept_one(&mut cl).await;
        let (mut c2, mut other) = accept_one(&mut cl).await;
        tagged.conn.tag(7);
        other.conn.tag(8);
        let signal = tagged.conn.signal();
        assert!(!signal.is_cut());

        cl.conns.cut_tagged(&[7]);
        tokio::time::timeout(Duration::from_secs(1), signal.wait())
            .await
            .unwrap();
        assert!(signal.is_cut());
        let mut buf = [0u8; 8];
        assert!(tagged.read(&mut buf).await.is_err());
        c2.write_all(b"hi").await.unwrap();
        assert_eq!(other.read(&mut buf).await.unwrap(), 2);
    }

    #[tokio::test]
    async fn a_connection_accepted_after_cut_all_starts_cut() {
        let mut cl = listener(TcpListener::bind("127.0.0.1:0").await.unwrap());
        cl.conns.cut_all();
        let (_client, io) = accept_one(&mut cl).await;
        assert!(io.conn.signal().is_cut());
    }

    #[tokio::test]
    async fn a_closed_connection_leaves_the_list() {
        let mut cl = listener(TcpListener::bind("127.0.0.1:0").await.unwrap());
        let (_c1, io) = accept_one(&mut cl).await;
        assert_eq!(cl.conns.live().len(), 1);
        drop(io);
        assert!(cl.conns.live().is_empty());
        let (_c2, _io2) = accept_one(&mut cl).await;
        assert_eq!(cl.conns.open().conns.len(), 1, "the dead entry was pruned");
    }

    #[test]
    fn no_signal_never_reports_a_cut() {
        assert!(!ConnectionCut(None).is_cut());
    }
}
