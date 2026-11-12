//! 앱이 쓰는 모든 폴더와 파일 위치를 계산하는 유일한 파일입니다.
//! - data_dir: 앱 데이터 디렉토리 (폴더가 없으면 자동 생성)
//! - models_dir: 모델 파일 저장소 (자동 생성)
//! - audio_dir: 녹음 오디오 파일 저장소 (자동 생성)
//! - db_path: SQLite DB 파일 경로 (생성하지 않음)
//! - engines_dir: 번들된 외부 실행 파일/리소스 디렉토리 (생성하지 않음)
//! - whisper_bin / llama_bin / sample_wav: 실행 파일 및 샘플 경로

use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// 폴더가 없으면 만들고 경로를 반환하는 도우미 함수 (한국어 오류 메시지 적용)
fn ensure_dir(dir: PathBuf) -> Result<PathBuf, String> {
    fs::create_dir_all(&dir).map_err(|e| {
        format!("폴더를 만들 수 없어요: {}: {}", dir.display(), e)
    })?;
    Ok(dir)
}

pub fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("앱 데이터 폴더를 찾을 수 없어요: {}", e))?;
    ensure_dir(path)
}

pub fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = data_dir(app)?;
    ensure_dir(base.join("models"))
}

pub fn audio_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = data_dir(app)?;
    ensure_dir(base.join("audio"))
}

pub fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let base = data_dir(app)?;
    Ok(base.join("efl-sprite.sqlite3"))
}

pub fn engines_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .resource_dir()
        .map_err(|e| format!("리소스 폴더를 찾을 수 없어요: {}", e))?;
    Ok(path.join("engines"))
}

pub fn whisper_bin(app: &AppHandle) -> Result<PathBuf, String> {
    let base = engines_dir(app)?;
    Ok(base.join("whisper").join(exe("whisper-cli")))
}

pub fn llama_bin(app: &AppHandle) -> Result<PathBuf, String> {
    let base = engines_dir(app)?;
    Ok(base.join("llama").join(exe("llama-server")))
}

pub fn sample_wav(app: &AppHandle) -> Result<PathBuf, String> {
    let base = engines_dir(app)?;
    Ok(base.join("samples").join("jfk.wav"))
}

pub fn exe(name: &str) -> String {
    if cfg!(windows) {
        format!("{}.exe", name)
    } else {
        name.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_exe_name() {
        let res = exe("whisper-cli");
        if cfg!(windows) {
            assert!(res.ends_with(".exe"));
        } else {
            assert_eq!(res, "whisper-cli");
        }
    }

    #[test]
    fn test_ensure_dir() {
        // 프로세스 ID로 독립된 테스트 폴더 생성 (동시 실행 시 충돌 방지)
        let temp_dir = std::env::temp_dir().join(format!("efl-paths-test-{}", std::process::id()));
        let target = temp_dir.join("sub").join("folder");

        // 1. 실제로 하위 폴더까지 잘 만들어지는지 확인
        let res = ensure_dir(target.clone());
        assert!(res.is_ok());
        assert!(target.exists());

        // 2. 이미 존재하는 폴더에 다시 호출해도 오류 없이 통과하는지 확인
        let res2 = ensure_dir(target.clone());
        assert!(res2.is_ok());

        // 테스트 정리
        let _ = fs::remove_dir_all(&temp_dir);
    }
}