//! Curated model catalog + downloader.
//!
//! Only models listed in `catalog/models.json` can be installed. Keeping the list
//! closed bounds the test matrix (prompt templates, VRAM, speed) to a handful of
//! known-good combinations.

use crate::paths;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

const CATALOG_JSON: &str = include_str!("../catalog/models.json");

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogEntry {
    pub id: String,
    pub kind: String, // "whisper" | "llm"
    pub name: String,
    pub file: String,
    pub url: String,
    pub size_mb: u32,
    pub min_vram_gb: u32,
    pub recommended: bool,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelEntry {
    #[serde(flatten)]
    pub entry: CatalogEntry,
    pub installed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress<'a> {
    id: &'a str,
    downloaded: u64,
    total: Option<u64>,
    done: bool,
    error: Option<String>,
}

pub fn catalog() -> Vec<CatalogEntry> {
    serde_json::from_str(CATALOG_JSON).expect("catalog/models.json is invalid")
}

pub fn find(id: &str) -> Result<CatalogEntry, String> {
    catalog()
        .into_iter()
        .find(|m| m.id == id)
        .ok_or_else(|| format!("unknown model id: {id}"))
}

pub fn model_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    let m = find(id)?;
    Ok(paths::models_dir(app)?.join(m.file))
}

/// Path of an installed model, or a clear error if it is not downloaded yet.
pub fn installed_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    let p = model_path(app, id)?;
    if p.is_file() {
        Ok(p)
    } else {
        Err(format!("모델이 설치되지 않았습니다: {id}"))
    }
}

#[tauri::command]
pub fn list_models(app: AppHandle) -> Result<Vec<ModelEntry>, String> {
    let dir = paths::models_dir(&app)?;
    Ok(catalog()
        .into_iter()
        .map(|entry| {
            let installed = dir.join(&entry.file).is_file();
            ModelEntry { entry, installed }
        })
        .collect())
}

#[tauri::command]
pub async fn download_model(app: AppHandle, id: String) -> Result<(), String> {
    let result = download_inner(&app, &id).await;
    if let Err(e) = &result {
        let _ = app.emit(
            "model-download-progress",
            Progress { id: &id, downloaded: 0, total: None, done: true, error: Some(e.clone()) },
        );
    }
    result
}

async fn download_inner(app: &AppHandle, id: &str) -> Result<(), String> {
    let m = find(id)?;
    let final_path = model_path(app, id)?;
    // Download to `<file>.part`, then rename: a crash never leaves a truncated model
    // that looks "installed".
    let part_path = final_path.with_extension(format!(
        "{}.part",
        final_path.extension().and_then(|e| e.to_str()).unwrap_or("bin")
    ));

    let resp = reqwest::Client::builder()
        .user_agent(concat!("EFL-Sprite/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?
        .get(&m.url)
        .send()
        .await
        .map_err(|e| format!("download failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("download failed: {e}"))?;

    let total = resp.content_length();
    let mut file = tokio::fs::File::create(&part_path)
        .await
        .map_err(|e| format!("cannot write {}: {e}", part_path.display()))?;

    let mut downloaded: u64 = 0;
    let mut last_emit: u64 = 0;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("download interrupted: {e}"))?;
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        // Throttle events to ~every 2 MB so the UI thread is not flooded.
        if downloaded - last_emit > 2 * 1024 * 1024 {
            last_emit = downloaded;
            let _ = app.emit(
                "model-download-progress",
                Progress { id, downloaded, total, done: false, error: None },
            );
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    // Close the handle before renaming — Windows refuses to rename open files.
    drop(file);

    if let Some(t) = total {
        if downloaded != t {
            let _ = tokio::fs::remove_file(&part_path).await;
            return Err(format!("incomplete download: {downloaded}/{t} bytes"));
        }
    }
    // Windows `rename` fails if the target exists; remove first.
    if final_path.exists() {
        tokio::fs::remove_file(&final_path).await.map_err(|e| e.to_string())?;
    }
    tokio::fs::rename(&part_path, &final_path).await.map_err(|e| e.to_string())?;

    let _ = app.emit(
        "model-download-progress",
        Progress { id, downloaded, total, done: true, error: None },
    );
    Ok(())
}

#[tauri::command]
pub fn delete_model(app: AppHandle, id: String) -> Result<(), String> {
    let p = model_path(&app, &id)?;
    if p.exists() {
        std::fs::remove_file(&p).map_err(|e| {
            format!("삭제 실패 (모델이 사용 중일 수 있습니다 — LLM을 먼저 정지하세요): {e}")
        })?;
    }
    Ok(())
}
