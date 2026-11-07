//! Recorded answers (16 kHz mono WAV, encoded in the UI by src/lib/recorder.ts).
//!
//! Files live in `<data_dir>/audio/` with ASCII names only (CLAUDE.md rule 4: Whisper gets
//! a copy under `tmp/` anyway, but keeping our own names ASCII avoids surprises on Windows).
//! Reading back is restricted to that folder.

use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

use crate::paths;

/// Lower-case ASCII letters, digits and '-' only; never empty.
pub fn safe_stem(name: &str) -> String {
    let s: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '-' })
        .collect();
    let s = s.trim_matches('-').chars().take(40).collect::<String>();
    if s.is_empty() { "rec".into() } else { s }
}

fn is_wav(data: &[u8]) -> bool {
    data.len() >= 44 && &data[0..4] == b"RIFF" && &data[8..12] == b"WAVE"
}

/// Save one recording; returns its absolute path (stored in `attempts.audio_path`).
#[tauri::command]
pub fn save_audio(app: AppHandle, name: String, data: Vec<u8>) -> Result<String, String> {
    if !is_wav(&data) {
        return Err("녹음 데이터가 WAV 형식이 아닙니다.".into());
    }
    let dir = paths::audio_dir(&app)?;
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let path = dir.join(format!("{}-{stamp}.wav", safe_stem(&name)));
    // Write to .part, then rename (target never exists: unique stamp).
    let part = path.with_extension("wav.part");
    std::fs::write(&part, &data).map_err(|e| format!("save audio: {e}"))?;
    std::fs::rename(&part, &path).map_err(|e| format!("save audio: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}

/// Read a saved recording back for playback. Only files inside the audio folder.
#[tauri::command]
pub fn read_audio(app: AppHandle, path: String) -> Result<tauri::ipc::Response, String> {
    let dir = paths::audio_dir(&app)?.canonicalize().map_err(|e| e.to_string())?;
    let p = PathBuf::from(&path).canonicalize().map_err(|_| "녹음 파일을 찾을 수 없습니다.".to_string())?;
    if !p.starts_with(&dir) {
        return Err("허용되지 않은 경로입니다.".into());
    }
    let bytes = std::fs::read(&p).map_err(|e| format!("read audio: {e}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stems_are_ascii_and_non_empty() {
        assert_eq!(safe_stem("홍길동 L&R #3"), "l-r--3");
        assert_eq!(safe_stem("한국어"), "rec");
        assert_eq!(safe_stem("attempt-12-s1"), "attempt-12-s1");
    }

    #[test]
    fn wav_header_check() {
        let mut h = b"RIFF\0\0\0\0WAVE".to_vec();
        h.resize(44, 0);
        assert!(is_wav(&h));
        assert!(!is_wav(b"not a wav"));
    }
}
