//! Curated model catalog + downloader.
//!
//! Only models listed in `catalog/models.json` can be installed. Keeping the list
//! closed bounds the test matrix (prompt templates, VRAM, speed) to a handful of
//! known-good combinations.

use crate::paths;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use tokio::io::AsyncWriteExt;

const CATALOG_JSON: &str = include_str!("../catalog/models.json");

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogEntry {
    pub id: String,
    pub kind: String, // "whisper" | "llm" | "gec"
    pub name: String,
    /// Single-file models: the file name. Multi-file models: the directory name.
    pub file: String,
    /// Single-file models only (empty for multi-file).
    #[serde(default)]
    pub url: String,
    /// Multi-file models (e.g. ONNX + tokenizer + config): downloaded into `models/<file>/`.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub files: Vec<CatalogFile>,
    /// License / attribution shown in Settings (required for some models).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub license: Option<String>,
    pub size_mb: u32,
    pub min_vram_gb: u32,
    pub recommended: bool,
    pub notes: String,
    /// LLM only: scoring prompt version measured to work best with this model.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
    /// LLM only: llama-server parallel slots (default 3) and context per slot (default 8192).
    /// Bigger models use fewer slots so the KV cache fits in memory.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parallel: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ctx_per_slot: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogFile {
    pub name: String,
    pub url: String,
}

impl CatalogEntry {
    fn is_multi(&self) -> bool {
        !self.files.is_empty()
    }
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

fn is_installed(m: &CatalogEntry, path: &std::path::Path) -> bool {
    if m.is_multi() {
        m.files.iter().all(|f| path.join(&f.name).is_file())
    } else {
        path.is_file()
    }
}

/// Path of an installed model (file, or directory for multi-file models), or a clear
/// error if it is not downloaded yet.
pub fn installed_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    let m = find(id)?;
    let p = paths::models_dir(app)?.join(&m.file);
    if is_installed(&m, &p) {
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
            let installed = is_installed(&entry, &dir.join(&entry.file));
            ModelEntry { entry, installed }
        })
        .collect())
}

/// Model ids currently downloading. Two concurrent downloads of the same model would
/// share one `.part` file; whichever finishes second then fails to rename it (ENOENT).
#[derive(Default)]
pub struct Downloads(pub Mutex<HashSet<String>>);

/// Removes the id from `Downloads` however the download ends (ok, error, panic).
struct InFlight<'a> {
    set: &'a Mutex<HashSet<String>>,
    id: String,
}
impl Drop for InFlight<'_> {
    fn drop(&mut self) {
        if let Ok(mut s) = self.set.lock() {
            s.remove(&self.id);
        }
    }
}

#[tauri::command]
pub async fn download_model(app: AppHandle, downloads: State<'_, Downloads>, id: String) -> Result<(), String> {
    {
        let mut set = downloads.0.lock().map_err(|e| e.to_string())?;
        if !set.insert(id.clone()) {
            // Silently ignore the repeat click; the first download keeps reporting progress.
            return Ok(());
        }
    }
    let _guard = InFlight { set: &downloads.0, id: id.clone() };

    // Tell the UI immediately so the button turns into a progress bar on click.
    let _ = app.emit(
        "model-download-progress",
        Progress { id: &id, downloaded: 0, total: None, done: false, error: None },
    );
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
    let client = reqwest::Client::builder()
        .user_agent(concat!("EFL-Sprite/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?;
    let target = model_path(app, id)?;

    let jobs: Vec<(String, PathBuf)> = if m.is_multi() {
        tokio::fs::create_dir_all(&target).await.map_err(|e| e.to_string())?;
        m.files.iter().map(|f| (f.url.clone(), target.join(&f.name))).collect()
    } else {
        vec![(m.url.clone(), target.clone())]
    };
    // Multi-file: report progress against the catalog's total size estimate.
    let estimate = if m.is_multi() { Some(m.size_mb as u64 * 1024 * 1024) } else { None };

    let mut base: u64 = 0;
    for (url, path) in jobs {
        if m.is_multi() && path.is_file() {
            continue; // resume: files finished in an earlier attempt
        }
        base += download_file(app, id, &client, &url, &path, base, estimate).await?;
    }
    let _ = app.emit(
        "model-download-progress",
        Progress { id, downloaded: base, total: estimate.or(Some(base)), done: true, error: None },
    );
    Ok(())
}

/// Download one file to `<path>.part`, then rename — a crash never leaves a truncated file
/// that looks installed. Returns the number of bytes written.
async fn download_file(
    app: &AppHandle,
    id: &str,
    client: &reqwest::Client,
    url: &str,
    final_path: &std::path::Path,
    base: u64,
    estimate: Option<u64>,
) -> Result<u64, String> {
    let file_name = final_path.file_name().and_then(|n| n.to_str()).unwrap_or("model");
    let part_path = final_path.with_file_name(format!("{file_name}.part"));

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("download failed ({file_name}): {e}"))?
        .error_for_status()
        .map_err(|e| format!("download failed ({file_name}): {e}"))?;

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
                Progress { id, downloaded: base + downloaded, total: estimate.or(total), done: false, error: None },
            );
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    // Close the handle before renaming — Windows refuses to rename open files.
    drop(file);

    if let Some(t) = total {
        if downloaded != t {
            let _ = tokio::fs::remove_file(&part_path).await;
            return Err(format!("incomplete download ({file_name}): {downloaded}/{t} bytes"));
        }
    }
    // Windows `rename` fails if the target exists; remove first.
    if final_path.exists() {
        tokio::fs::remove_file(final_path).await.map_err(|e| e.to_string())?;
    }
    tokio::fs::rename(&part_path, final_path).await.map_err(|e| e.to_string())?;
    Ok(downloaded)
}

#[tauri::command]
pub fn delete_model(app: AppHandle, id: String) -> Result<(), String> {
    let p = model_path(&app, &id)?;
    let res = if p.is_dir() {
        std::fs::remove_dir_all(&p)
    } else if p.exists() {
        std::fs::remove_file(&p)
    } else {
        Ok(())
    };
    res.map_err(|e| format!("삭제 실패 (모델이 사용 중일 수 있습니다 — 앱을 다시 시작한 뒤 삭제해 보세요): {e}"))
}
