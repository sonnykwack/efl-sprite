# EFL Sprite 개인정보처리방침 / Privacy Policy

시행일 / Effective date: 2026-11-14 (이전 버전 2026-11-08 / previous version 2026-11-08)

---

## 한국어

EFL Sprite(이하 "앱")는 사용자의 개인정보를 수집하거나 외부로 전송하지 않습니다.

### 1. 처리하는 정보와 저장 위치
앱은 다음 정보를 **사용자의 기기 안에만** 저장합니다.

| 정보 | 용도 | 저장 위치 |
|---|---|---|
| 학생 이름(선택 입력) | 응시 기록을 학생별로 구분 | 기기 내 앱 데이터 폴더(SQLite) |
| 작성한 답안, 채점 결과, 교사 점수·첨삭 | 피드백 제공, 학습 기록 | 기기 내 앱 데이터 폴더(SQLite) |
| 스피킹 녹음 파일 | 음성 인식 후 채점, 다시 듣기 | 기기 내 앱 데이터 폴더 |
| 문제 데이터 | 연습 문제 제공 | 기기 내 앱 데이터 폴더 |

음성 인식과 AI 채점은 모두 **기기 안에서 실행되는 AI 모델**로 처리합니다. 답안·녹음·점수는 개발자를 포함한 어떤 서버로도 전송되지 않습니다.

### 2. 마이크 사용
마이크는 사용자가 스피킹 문제에서 "시작"을 눌렀을 때만 사용하며, 녹음은 기기 안에서 음성 인식과 다시 듣기에만 사용합니다. 마이크 권한은 Windows 설정 → 개인 정보 → 마이크에서 언제든 끌 수 있습니다.

### 3. 인터넷 사용
앱은 다음 경우에만 인터넷을 사용합니다.
- 사용자가 **AI 모델 다운로드**를 누를 때: Hugging Face(huggingface.co)에서 모델 파일을 내려받습니다. 이때 일반적인 웹 다운로드와 마찬가지로 다운로드 서버가 IP 주소 등 접속 정보를 처리할 수 있으며, 이는 해당 서비스의 정책을 따릅니다.

이 밖에 분석 도구, 광고, 사용 통계 수집 기능은 없습니다.

### 4. 제3자 제공
개인정보를 제3자에게 제공하거나 판매하지 않습니다.

### 5. 문제 파일 공유
"파일로 내보내기"로 만든 문제 파일(.eflsprite)에는 문제 내용과 사용자가 입력한 세트 이름·작성자만 들어가며, 학생 답안이나 점수는 포함되지 않습니다. 파일을 누구에게 보낼지는 사용자가 직접 결정합니다.

### 6. 정보 삭제
- 문제를 삭제하면 그 문제로 응시한 기록, 채점 결과, 교사 첨삭이 기기에서 함께 삭제됩니다. 응시 기록을 하나씩 삭제하는 기능은 아직 없습니다.
- 스피킹 녹음 파일은 문제를 삭제해도 앱 데이터 폴더의 `audio` 폴더에 남습니다. 이 폴더를 직접 지우거나 앱을 제거하면 삭제됩니다.
- **Microsoft Store 버전**은 앱을 제거하면 앱 데이터 폴더의 모든 정보가 함께 삭제됩니다.
- GitHub에서 받은 **설치 파일 버전**은 제거할 때 "앱 데이터 삭제"를 선택하거나 데이터 폴더(Windows `%APPDATA%\com.xogns.eflsprite`, macOS `~/Library/Application Support/com.xogns.eflsprite`)를 직접 지우면 삭제됩니다.

### 7. 아동의 개인정보
앱은 계정 생성이나 연락처 수집 기능이 없으며, 모든 정보는 기기 안에만 저장됩니다.

### 8. 문의
- 개발자: 곽태훈 (Taehoon Kwack)
- 문의: https://github.com/sonnykwack/efl-sprite/issues

이 방침이 바뀌면 이 페이지에 시행일과 함께 게시합니다.

---

## English

EFL Sprite ("the app") does not collect personal information or send it off the device.

### 1. Information processed and where it is stored
The app stores the following **only on the user's device**:

| Information | Purpose | Location |
|---|---|---|
| Student name (optional) | Group practice records by student | App data folder on the device (SQLite) |
| Written responses, scores, teacher scores and corrections | Feedback and learning history | App data folder on the device (SQLite) |
| Speaking recordings | On-device speech recognition and playback | App data folder on the device |
| Practice tasks | Provide practice tasks | App data folder on the device |

Speech recognition and AI scoring run **on the device**. Responses, recordings and scores are never sent to any server, including the developer's.

### 2. Microphone
The microphone is used only after the user presses "Start" on a speaking task. Recordings are used on the device for speech recognition and playback only. Microphone access can be turned off at any time in Windows Settings → Privacy → Microphone.

### 3. Internet
The app uses the internet only when the user chooses to **download AI models** from Hugging Face (huggingface.co). As with any web download, the download server may process connection data such as the IP address under its own policy.

The app contains no analytics, advertising or usage tracking.

### 4. Third parties
No personal information is shared with or sold to third parties.

### 5. Task files
Task files exported by the user (.eflsprite) contain only task content and the set name/author the user typed. They never contain student responses or scores. The user decides whom to send them to.

### 6. Deletion
- Deleting a task removes its attempts, scores and teacher reviews from the device. Deleting individual attempts is not yet supported.
- Speaking recordings stay in the `audio` folder of the app data folder even after their task is deleted; they are removed when that folder is deleted or the app is uninstalled.
- **Microsoft Store version**: uninstalling the app removes all data in its app data folder.
- **Installer version from GitHub**: choose "delete application data" when uninstalling, or delete the data folder yourself (Windows `%APPDATA%\com.xogns.eflsprite`, macOS `~/Library/Application Support/com.xogns.eflsprite`).

### 7. Children
The app has no accounts and collects no contact information. All data stays on the device.

### 8. Contact
- Developer: Taehoon Kwack (곽태훈)
- Contact: https://github.com/sonnykwack/efl-sprite/issues

Changes to this policy will be posted on this page with a new effective date.
