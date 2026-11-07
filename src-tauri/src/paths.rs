//! Every filesystem location the app uses is resolved here — nowhere else.
//!
//! Cross-platform rules (see docs/development.md):
//! - Only `PathBuf::join`, never string concatenation with '/' or '\\'.
//! - User data goes under Tauri's `app_data_dir()`:
//!     macOS   ~/Library/Application Support/com.xogns.eflsprite
//!     Windows %APPDATA%\com.xogns.eflsprite   (MSIX virtualises this per package)
//! - Bundled engine binaries live under `<resource_dir>/engines/` (see tauri.<os>.conf.json).

use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
    Ok(dir)
}

pub fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = data_dir(app)?.join("models");
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
    Ok(dir)
}

/// Recorded answers (16 kHz WAV).
pub fn audio_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = data_dir(app)?.join("audio");
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
    Ok(dir)
}

pub fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("efl-sprite.sqlite3"))
}

pub fn engines_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("engines"))
}

/// Adds `.exe` on Windows. Use for every executable name.
pub fn exe(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    }
}

pub fn whisper_bin(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(engines_dir(app)?.join("whisper").join(exe("whisper-cli")))
}

pub fn llama_bin(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(engines_dir(app)?.join("llama").join(exe("llama-server")))
}

pub fn sample_wav(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(engines_dir(app)?.join("samples").join("jfk.wav"))
}
