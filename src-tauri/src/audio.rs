use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use crate::paths;

const MAX_AUDIO_SIZE: u64 = 100 * 1024 * 1024; // 100 MB 제한

/// ASCII 영숫자와 하이픈(-)만 남기고 정제, 최대 40자, 비면 "rec" 반환
fn safe_stem(name: &str) -> String {
    let stem: String = name
        .to_lowercase()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c
            } else {
                '-'
            }
        })
        .collect();

    // 연속된 하이픈을 하나로 줄이고 앞뒤 하이픈 제거
    let mut cleaned = String::new();
    let mut last_was_hyphen = true; // 시작 부분 하이픈 방지용
    for c in stem.chars() {
        if c == '-' {
            if !last_was_hyphen {
                cleaned.push('-');
                last_was_hyphen = true;
            }
        } else {
            cleaned.push(c);
            last_was_hyphen = false;
        }
    }
    if cleaned.ends_with('-') {
        cleaned.pop();
    }

    let truncated: String = cleaned.chars().take(40).collect();
    if truncated.is_empty() {
        "rec".to_string()
    } else {
        truncated
    }
}

/// WAV 헤더 기본 검증 (RIFF ... WAVE)
fn is_wav(data: &[u8]) -> bool {
    if data.len() < 44 {
        return false;
    }
    &data[0..4] == b"RIFF" && &data[8..12] == b"WAVE"
}

/// 보안 검증: 요청된 경로가 반드시 허용된 기준 폴더(audio_dir) 내부에 있는지 확인
fn ensure_inside(dir: &Path, path: &Path) -> Result<PathBuf, String> {
    if !path.exists() {
        return Err("녹음 파일을 찾을 수 없습니다.".to_string());
    }

    let canonical_dir = dir
        .canonicalize()
        .map_err(|e| format!("기준 폴더 경로를 확인할 수 없어요: {}", e))?;
    
    let canonical_path = path
        .canonicalize()
        .map_err(|e| format!("파일 경로를 확인할 수 없어요: {}", e))?;

    if !canonical_path.starts_with(&canonical_dir) {
        return Err("허용되지 않은 경로입니다.".to_string());
    }

    Ok(canonical_path)
}

#[tauri::command]
pub fn save_audio(app: AppHandle, name: String, data: Vec<u8>) -> Result<String, String> {
    // 1. WAV 형식 검증
    if !is_wav(&data) {
        return Err("올바른 WAV 오디오 형식이 아니에요.".to_string());
    }

    // 2. 파일 크기 검증
    if data.len() as u64 > MAX_AUDIO_SIZE {
        return Err("오디오 파일 크기가 너무 커서 저장할 수 없어요.".to_string());
    }

    // 3. 오디오 저장 폴더 확보
    let audio_dir = paths::audio_dir(&app)?;

    // 4. 안전한 파일 이름 생성 ({stem}-{timestamp}.wav)
    let stem = safe_stem(&name);
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("시간을 가져올 수 없어요: {}", e))?
        .as_millis();
    
    let file_name = format!("{}-{}.wav", stem, millis);
    let target_path = audio_dir.join(&file_name);
    let part_path = audio_dir.join(format!("{}.part", file_name));

    // 5. 임시 파일(.part)로 저장 후 이름 바꾸기 (새 파일이므로 실패 시 .part 안전 삭제 가능)
    if let Err(e) = fs::write(&part_path, &data) {
        let _ = fs::remove_file(&part_path);
        return Err(format!("오디오 파일을 저장할 수 없어요: {}", e));
    }

    if let Err(e) = fs::rename(&part_path, &target_path) {
        let _ = fs::remove_file(&part_path);
        return Err(format!("오디오 파일을 확정할 수 없어요: {}", e));
    }

    // 6. 절대 경로 문자열 반환 (DB attempts.audio_path 저장용)
    let path_str = target_path
        .to_str()
        .ok_or_else(|| "파일 경로를 문자열로 변환할 수 없어요.".to_string())?
        .to_string();

    Ok(path_str)
}

#[tauri::command]
pub fn read_audio(app: AppHandle, path: String) -> Result<tauri::ipc::Response, String> {
    let audio_dir = paths::audio_dir(&app)?;
    let target_path = PathBuf::from(path);

    // 보안 검증 (canonicalize 비교를 통해 경로 이탈 원천 차단)
    let valid_path = ensure_inside(&audio_dir, &target_path)?;

    // 바이트 읽기
    let bytes = fs::read(&valid_path)
        .map_err(|e| format!("오디오 파일을 읽을 수 없어요: {}", e))?;

    // tauri::ipc::Response::new()로 반환하여 프론트엔드에서 ArrayBuffer로 빠르게 수신
    Ok(tauri::ipc::Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_safe_stem() {
        assert_eq!(safe_stem("홍길동 L&R #3"), "l-r-3");
        assert_eq!(safe_stem("한국어"), "rec");
        assert_eq!(safe_stem("attempt-12-s1"), "attempt-12-s1");
    }

    #[test]
    fn test_is_wav() {
        // 최소 44바이트, RIFF 및 WAVE 매칭 확인
        let mut valid_wav = vec![0u8; 44];
        valid_wav[0..4].copy_from_slice(b"RIFF");
        valid_wav[8..12].copy_from_slice(b"WAVE");
        assert!(is_wav(&valid_wav));

        let invalid_wav = vec![0u8; 44];
        assert!(!is_wav(&invalid_wav));
    }

    #[test]
    fn test_ensure_inside() {
        // 프로세스 ID로 독립된 테스트 폴더 격리
        let temp_dir = std::env::temp_dir().join(format!("efl-audio-test-{}", std::process::id()));
        let audio_sub = temp_dir.join("audio");
        fs::create_dir_all(&audio_sub).unwrap();

        // 1. 임시 폴더 안의 정상 파일 생성 및 통과 테스트
        let inside_file = audio_sub.join("test.wav");
        fs::write(&inside_file, b"RIFF....WAVE....").unwrap();
        let res1 = ensure_inside(&audio_sub, &inside_file);
        assert!(res1.is_ok());

        // 2. 폴더 밖의 파일(경로 이탈 시도) 거부 테스트
        let outside_file = temp_dir.join("outside.wav");
        fs::write(&outside_file, b"RIFF....WAVE....").unwrap();
        let res2 = ensure_inside(&audio_sub, &outside_file);
        assert!(res2.is_err());
        assert_eq!(res2.unwrap_err(), "허용되지 않은 경로입니다.");

        // 2-1. 상위 폴더(..)를 통한 우회 시도 검증
        let sneaky = audio_sub.join("..").join("outside.wav");
        assert_eq!(ensure_inside(&audio_sub, &sneaky).unwrap_err(), "허용되지 않은 경로입니다.");

        // 3. 존재하지 않는 파일 테스트
        let missing_file = audio_sub.join("missing.wav");
        let res3 = ensure_inside(&audio_sub, &missing_file);
        assert!(res3.is_err());
        assert_eq!(res3.unwrap_err(), "녹음 파일을 찾을 수 없습니다.");

        // 테스트 디렉토리 정리
        let _ = fs::remove_dir_all(&temp_dir);
    }
}