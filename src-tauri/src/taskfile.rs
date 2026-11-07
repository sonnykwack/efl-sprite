//! Task pack files (`.eflsprite`, JSON inside) for sharing problem sets by KakaoTalk / USB.
//!
//! The path always comes from the OS file dialog (tauri-plugin-dialog) the user just used, so
//! these commands only read/write that one file. The JSON is validated in the UI
//! (src/lib/taskpack.ts); Rust only enforces size and UTF-8.

const MAX_BYTES: u64 = 5 * 1024 * 1024;

#[tauri::command]
pub fn read_task_file(path: String) -> Result<String, String> {
    let meta = std::fs::metadata(&path).map_err(|e| format!("파일을 열 수 없습니다: {e}"))?;
    if meta.len() > MAX_BYTES {
        return Err("파일이 너무 큽니다 (최대 5 MB).".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| format!("파일을 읽을 수 없습니다: {e}"))?;
    // Strip a UTF-8 BOM (Windows Notepad adds one when an assistant edits the file).
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF][..]).unwrap_or(&bytes);
    String::from_utf8(bytes.to_vec()).map_err(|_| "UTF-8 텍스트 파일이 아닙니다.".into())
}

#[tauri::command]
pub fn write_task_file(path: String, contents: String) -> Result<(), String> {
    // Write next to the target, then replace it (Windows: remove the old file first).
    let target = std::path::PathBuf::from(&path);
    let tmp = target.with_extension("eflsprite.part");
    std::fs::write(&tmp, contents.as_bytes()).map_err(|e| format!("파일을 저장할 수 없습니다: {e}"))?;
    if target.exists() {
        std::fs::remove_file(&target).map_err(|e| format!("기존 파일을 바꿀 수 없습니다: {e}"))?;
    }
    std::fs::rename(&tmp, &target).map_err(|e| format!("파일을 저장할 수 없습니다: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_and_bom() {
        let dir = std::env::temp_dir().join(format!("efl-taskfile-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("팩.eflsprite");
        write_task_file(p.to_string_lossy().into(), "{\"a\":\"한글\"}".into()).unwrap();
        write_task_file(p.to_string_lossy().into(), "{\"a\":\"두번째\"}".into()).unwrap(); // overwrite
        assert_eq!(read_task_file(p.to_string_lossy().into()).unwrap(), "{\"a\":\"두번째\"}");
        let mut bom = vec![0xEF, 0xBB, 0xBF];
        bom.extend_from_slice(b"{}");
        std::fs::write(&p, bom).unwrap();
        assert_eq!(read_task_file(p.to_string_lossy().into()).unwrap(), "{}");
        std::fs::remove_dir_all(&dir).ok();
    }
}
