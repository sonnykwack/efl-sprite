//! 문제 묶음 파일(.eflsprite) 읽기/쓰기.
//! - 파일 경로는 항상 OS 파일 대화상자에서 온 안전한 경로입니다.
//! - JSON 형식 검사는 화면 쪽(taskpack.ts)에서 수행하므로 여기서는 다루지 않습니다.

use std::fs;
use std::path::PathBuf;

const MAX_FILE_SIZE: u64 = 5 * 1024 * 1024; // 5 MB
const UTF8_BOM: &[u8] = &[0xEF, 0xBB, 0xBF];

#[tauri::command]
pub fn read_task_file(path: String) -> Result<String, String> {
    let file_path = PathBuf::from(path);

    // 1. 파일 크기 확인 (5MB 초과 시 오류)
    let metadata = fs::metadata(&file_path)
        .map_err(|e| format!("파일 정보를 읽을 수 없어요: {}", e))?;
    
    if metadata.len() > MAX_FILE_SIZE {
        return Err("파일 크기가 5MB를 초과하여 읽을 수 없어요.".to_string());
    }

    // 2. 바이트 단위로 읽기
    let mut bytes = fs::read(&file_path)
        .map_err(|e| format!("파일을 읽는 중 오류가 발생했어요: {}", e))?;

    // 3. 맨 앞 UTF-8 BOM(EF BB BF) 제거
    if bytes.starts_with(UTF8_BOM) {
        bytes.drain(0..3);
    }

    // 4. UTF-8 유효성 검증 및 문자열 변환
    let contents = String::from_utf8(bytes)
        .map_err(|_| "파일이 올바른 UTF-8 형식의 텍스트가 아니에요.".to_string())?;

    Ok(contents)
}

#[tauri::command]
pub fn write_task_file(path: String, contents: String) -> Result<(), String> {
    let target_path = PathBuf::from(path);
    
    // 부모 디렉토리 경로 확보
    let parent_dir = target_path.parent().unwrap_or_else(|| std::path::Path::new(""));
    let file_name = target_path
        .file_name()
        .ok_or_else(|| "올바르지 않은 파일 경로예요.".to_string())?;

    // 임시 파일 경로 생성 (이름.eflsprite.part)
    let mut part_file_name = file_name.to_os_string();
    part_file_name.push(".part");
    let part_path = parent_dir.join(part_file_name);

    // ① 실패 → .part 지워도 됨 (원래 파일은 그대로)
    if let Err(e) = fs::write(&part_path, contents.as_bytes()) {
        let _ = fs::remove_file(&part_path);
        return Err(format!("파일을 저장하는 중 오류가 발생했어요: {e}"));
    }

    // ② 실패 → .part 지워도 됨 (원래 파일은 그대로)
    if target_path.exists() {
        if let Err(e) = fs::remove_file(&target_path) {
            let _ = fs::remove_file(&part_path);
            return Err(format!("기존 파일을 바꿀 수 없어요: {e}"));
        }
    }

    // ③ 실패 → .part를 남겨 둠 (이제 유일한 사본)
    fs::rename(&part_path, &target_path).map_err(|e| {
        format!("저장 중 오류가 발생했어요. 내용은 {}에 남아 있어요: {e}", part_path.display())
    })?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_task_file_operations() {
        // 프로세스 ID로 독립된 테스트 폴더 생성 (동시 실행 시 충돌 방지)
        let dir = std::env::temp_dir().join(format!("efl-taskfile-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();

        // 한글 파일명 테스트 (팩.eflsprite)
        let file_path = dir.join("팩.eflsprite");
        let path_str = file_path.to_str().unwrap().to_string();

        // 1. 쓰기 테스트
        let first_content = "첫 번째 문제 묶음 내용";
        assert!(write_task_file(path_str.clone(), first_content.to_string()).is_ok());

        // 2. 덮어쓰기 테스트
        let second_content = "두 번째 문제 묶음 내용 (업데이트됨)";
        assert!(write_task_file(path_str.clone(), second_content.to_string()).is_ok());

        // 3. 읽어서 두 번째 내용인지 확인
        let read_result = read_task_file(path_str.clone());
        assert!(read_result.is_ok());
        assert_eq!(read_result.unwrap(), second_content);

        // 4. BOM이 붙은 파일 생성 후 읽기 테스트 (한 줄 방식으로 깔끔하게 작성)
        let bom_content = [UTF8_BOM, "BOM이 포함된 내용".as_bytes()].concat();
        fs::write(&file_path, bom_content).unwrap();

        // 5. BOM이 사라졌는지 확인
        let bom_read_result = read_task_file(path_str.clone());
        assert!(bom_read_result.is_ok());
        let read_text = bom_read_result.unwrap();
        
        // 결과 문자열에 BOM 문자가 포함되어 있지 않고 내용만 정확히 읽혔는지 확인
        assert_eq!(read_text, "BOM이 포함된 내용");
        assert!(!read_text.starts_with('\u{FEFF}'));

        // 테스트 디렉토리 정리
        let _ = fs::remove_dir_all(&dir);
    }
}