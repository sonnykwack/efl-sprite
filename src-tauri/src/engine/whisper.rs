//! Speech-to-text via whisper.cpp's `whisper-cli`.
//!
//! Input must be 16 kHz mono 16-bit PCM WAV (the recorder will produce exactly that).

use super::{command, rel_arg, threads};
use crate::{models, paths};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

/// Transcribe a WAV file. `wav_path == "__sample__"` uses the bundled JFK sample
/// (engine smoke test from the Settings page).
#[tauri::command]
pub async fn transcribe(app: AppHandle, wav_path: String, model_id: String) -> Result<String, String> {
    let bin = paths::whisper_bin(&app)?;
    if !bin.is_file() {
        return Err(format!(
            "Whisper 엔진이 없습니다: {} — `npm run fetch-engines`를 실행하세요.",
            bin.display()
        ));
    }
    let model = models::installed_path(&app, &model_id)?;
    let data = paths::data_dir(&app)?;

    let src = if wav_path == "__sample__" {
        paths::sample_wav(&app)?
    } else {
        std::path::PathBuf::from(&wav_path)
    };
    if !src.is_file() {
        return Err(format!("오디오 파일이 없습니다: {}", src.display()));
    }

    // Copy the input to an ASCII-named file inside the data dir (see engine/mod.rs rule 2).
    let tmp_dir = data.join("tmp");
    std::fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let tmp_wav = tmp_dir.join(format!("in-{stamp}.wav"));
    std::fs::copy(&src, &tmp_wav).map_err(|e| format!("copy audio: {e}"))?;

    let model_arg = rel_arg(&model, &data)?;
    let wav_arg = rel_arg(&tmp_wav, &data)?;

    let output = tauri::async_runtime::spawn_blocking(move || {
        command(&bin, &data)
            .args(["-m", &model_arg, "-f", &wav_arg])
            .args(["-l", "en", "-t", &threads().to_string()])
            // -nt: no timestamps, -np: no progress/log prints → stdout is just the text
            .args(["-nt", "-np"])
            .output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("whisper-cli 실행 실패: {e}"));

    let _ = std::fs::remove_file(&tmp_wav);
    let output = output?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        let tail: String = err.lines().rev().take(15).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
        return Err(format!("whisper-cli 종료 코드 {:?}\n{tail}", output.status.code()));
    }

    let text = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    Ok(text)
}
