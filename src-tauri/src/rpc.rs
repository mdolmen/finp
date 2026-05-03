// Bridge to the Python sidecar over line-delimited JSON-RPC 2.0.
// One in-flight request at a time, serialized through a mutex.

use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicI64, Ordering};

use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::Mutex;

#[derive(Debug, thiserror::Error)]
pub enum RpcError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("sidecar exited unexpectedly")]
    Closed,
    #[error("malformed response: {0}")]
    Malformed(String),
    #[error("rpc error {code}: {message}")]
    Remote { code: i64, message: String },
}

pub struct RpcClient {
    next_id: AtomicI64,
    inner: Mutex<Inner>,
    _child: Child,
}

struct Inner {
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

impl RpcClient {
    pub async fn spawn() -> anyhow::Result<Self> {
        let backend_dir: PathBuf = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("src-tauri has a parent")
            .join("backend");

        let mut child = Command::new("uv")
            .arg("run")
            .arg("--project")
            .arg(&backend_dir)
            .arg("finp-rpc")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .kill_on_drop(true)
            .spawn()?;

        let stdin = child.stdin.take().ok_or_else(|| anyhow::anyhow!("no stdin"))?;
        let stdout = child.stdout.take().ok_or_else(|| anyhow::anyhow!("no stdout"))?;

        Ok(Self {
            next_id: AtomicI64::new(1),
            inner: Mutex::new(Inner { stdin, stdout: BufReader::new(stdout) }),
            _child: child,
        })
    }

    pub async fn request(&self, method: &str, params: Value) -> Result<Value, RpcError> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let req = json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params });
        let mut payload = serde_json::to_vec(&req).map_err(|e| RpcError::Malformed(e.to_string()))?;
        payload.push(b'\n');

        let mut guard = self.inner.lock().await;
        guard.stdin.write_all(&payload).await?;
        guard.stdin.flush().await?;

        let mut line = String::new();
        let n = guard.stdout.read_line(&mut line).await?;
        if n == 0 {
            return Err(RpcError::Closed);
        }

        let resp: Value = serde_json::from_str(line.trim())
            .map_err(|e| RpcError::Malformed(e.to_string()))?;

        if let Some(err) = resp.get("error") {
            let code = err.get("code").and_then(|v| v.as_i64()).unwrap_or(-1);
            let message = err.get("message").and_then(|v| v.as_str()).unwrap_or("").to_string();
            return Err(RpcError::Remote { code, message });
        }

        resp.get("result")
            .cloned()
            .ok_or_else(|| RpcError::Malformed("missing result".into()))
    }
}
