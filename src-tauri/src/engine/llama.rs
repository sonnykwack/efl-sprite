//! LLM via llama.cpp's `llama-server`, run as a local child process and spoken to
//! over its OpenAI-compatible HTTP API on 127.0.0.1.
//!
//! Lifecycle: `llm_start(model)` spawns (or reuses) the server and waits for /health;
//! `llm_chat` sends one chat completion; the server is killed on `llm_stop` and on app exit.

use super::{command, rel_arg, threads};
use crate::{models, paths};
use serde::Deserialize;
use serde_json::json;
use std::fs::File;
use std::net::TcpListener;
use std::process::{Child, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State};

pub struct Running {
    child: Child,
    port: u16,
    model_id: String,
}

#[derive(Default)]
pub struct LlamaState(pub Mutex<Option<Running>>);

#[derive(Debug, Deserialize, serde::Serialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

const HEALTH_TIMEOUT: Duration = Duration::from_secs(180);

fn free_port() -> Result<u16, String> {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .map_err(|e| format!("no free port: {e}"))
}

fn log_tail(app: &AppHandle) -> String {
    paths::data_dir(app)
        .ok()
        .and_then(|d| std::fs::read_to_string(d.join("logs").join("llama-server.log")).ok())
        .map(|s| s.lines().rev().take(20).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n"))
        .unwrap_or_default()
}

/// Start llama-server for `model_id` (no-op if it is already serving that model).
/// Returns the port.
#[tauri::command]
pub async fn llm_start(app: AppHandle, state: State<'_, LlamaState>, model_id: String) -> Result<u16, String> {
    let port = {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        if let Some(r) = guard.as_mut() {
            let alive = matches!(r.child.try_wait(), Ok(None));
            if alive && r.model_id == model_id {
                return Ok(r.port);
            }
            let _ = r.child.kill();
            let _ = r.child.wait();
            *guard = None;
        }

        let bin = paths::llama_bin(&app)?;
        if !bin.is_file() {
            return Err(format!(
                "LLM 엔진이 없습니다: {} — `npm run fetch-engines`를 실행하세요.",
                bin.display()
            ));
        }
        let data = paths::data_dir(&app)?;
        let model = models::installed_path(&app, &model_id)?;
        let model_arg = rel_arg(&model, &data)?;
        let port = free_port()?;

        let log_dir = data.join("logs");
        std::fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;
        let log = File::create(log_dir.join("llama-server.log")).map_err(|e| e.to_string())?;
        let log_err = log.try_clone().map_err(|e| e.to_string())?;

        let child = command(&bin, &data)
            .args(["-m", &model_arg])
            .args(["--host", "127.0.0.1", "--port", &port.to_string()])
            .args(["-c", "8192"]) // context: prompt + rubric + essay + answer
            .args(["-ngl", "999"]) // offload all layers to GPU when available (ignored on CPU builds)
            .args(["-t", &threads().to_string()])
            .arg("--jinja") // use the model's own chat template
            .stdin(Stdio::null())
            .stdout(Stdio::from(log))
            .stderr(Stdio::from(log_err))
            .spawn()
            .map_err(|e| format!("llama-server 실행 실패: {e}"))?;

        *guard = Some(Running { child, port, model_id });
        port
    }; // lock released before awaiting

    let client = reqwest::Client::new();
    let url = format!("http://127.0.0.1:{port}/health");
    let started = Instant::now();
    loop {
        if let Ok(r) = client.get(&url).timeout(Duration::from_secs(2)).send().await {
            if r.status().is_success() {
                return Ok(port);
            }
        }
        // Did the process die (bad model, out of memory, missing DLL)?
        {
            let mut guard = state.0.lock().map_err(|e| e.to_string())?;
            if let Some(r) = guard.as_mut() {
                if let Ok(Some(status)) = r.child.try_wait() {
                    *guard = None;
                    return Err(format!("llama-server가 종료됨 ({status})\n{}", log_tail(&app)));
                }
            }
        }
        if started.elapsed() > HEALTH_TIMEOUT {
            stop(&app);
            return Err(format!("llama-server 응답 없음 (timeout)\n{}", log_tail(&app)));
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
}

/// One chat completion. If `json_schema` is given, output is grammar-constrained to it.
#[tauri::command]
pub async fn llm_chat(
    state: State<'_, LlamaState>,
    messages: Vec<ChatMessage>,
    json_schema: Option<serde_json::Value>,
) -> Result<String, String> {
    let port = {
        let guard = state.0.lock().map_err(|e| e.to_string())?;
        guard.as_ref().map(|r| r.port).ok_or("LLM이 실행 중이 아닙니다 (llm_start 먼저)")?
    };

    let mut body = json!({
        "messages": messages,
        "temperature": 0.2,
        // Korean feedback costs ~2× the tokens of English; 3 criteria + summary fit in 3000.
        "max_tokens": 3000,
    });
    if let Some(schema) = json_schema {
        body["response_format"] = json!({
            "type": "json_schema",
            "json_schema": { "name": "result", "schema": schema }
        });
    }

    let resp: serde_json::Value = reqwest::Client::new()
        .post(format!("http://127.0.0.1:{port}/v1/chat/completions"))
        .timeout(Duration::from_secs(600))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("LLM 요청 실패: {e}"))?
        .error_for_status()
        .map_err(|e| format!("LLM 오류: {e}"))?
        .json()
        .await
        .map_err(|e| format!("LLM 응답 파싱 실패: {e}"))?;

    resp["choices"][0]["message"]["content"]
        .as_str()
        .map(str::to_owned)
        .ok_or_else(|| format!("unexpected response: {resp}"))
}

#[tauri::command]
pub fn llm_stop(app: AppHandle) {
    stop(&app);
}

/// Kill the server if running. Called on app exit too, so no orphan process
/// keeps holding VRAM or locking the model file (Windows).
pub fn stop(app: &AppHandle) {
    if let Some(state) = app.try_state::<LlamaState>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(mut r) = guard.take() {
                let _ = r.child.kill();
                let _ = r.child.wait();
            }
        }
    }
}
