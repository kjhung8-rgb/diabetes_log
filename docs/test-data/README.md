# 테스트 데이터

Firestore 동기화와 화면 표시를 테스트하기 위한 더미 혈당 기록 파일입니다. 앱 코드 수정이나 재배포 없이, 배포된 웹앱에서 로그인한 계정에 테스트 데이터를 넣을 수 있습니다.

## 파일

- `dummy-readings-2026-06-01-to-2026-07-08.json`: 2026년 6월 1일부터 2026년 7월 8일까지의 더미 기록입니다. 총 212개 기록이 들어 있습니다.
- `dummy-readings-2026-07-09-to-2028-07-09.json`: 2026년 7월 9일부터 2028년 7월 9일까지의 더미 기록입니다. 총 4046개 기록이 들어 있습니다.
- `import-dummy-to-current-account-console.js`: 현재 로그인된 Firebase 계정에 더미 기록을 넣는 브라우저 콘솔용 스크립트입니다.

## 가져오기 방법

1. `https://diabetes-log-pwa.web.app`에 접속합니다.
2. 허용된 Google 계정으로 로그인합니다.
3. 브라우저 개발자도구 Console을 엽니다.
4. 콘솔 붙여넣기가 막혀 있으면 `allow pasting`을 입력하고 Enter를 누릅니다.
5. `import-dummy-to-current-account-console.js` 내용을 전체 복사해서 Console에 붙여넣고 실행합니다.
6. 파일 선택창이 열리면 넣고 싶은 더미 JSON 파일을 선택합니다.
7. 확인 창에서 승인하면 Firestore에 데이터가 저장되고 페이지가 새로고침됩니다.

## 주의사항

- 허용 이메일은 스크립트 안의 `allowedEmails` 목록에 있는 계정만 통과합니다.
- 모든 더미 문서 ID는 `dummy-`로 시작합니다.
- 같은 JSON 파일을 다시 넣으면 같은 `dummy-` 문서 ID가 덮어써집니다.
- 실제 기록 ID와는 겹치지 않도록 만들었지만, 화면에서는 실제 기록과 더미 기록이 함께 보일 수 있습니다.
- Firestore 쓰기 횟수가 발생하므로 큰 파일은 테스트 목적일 때만 사용합니다.

---

# English

# Test Data

Dummy glucose readings for Firestore sync and UI testing. These files can be imported into the currently signed-in account from the deployed web app without code changes or redeployment.

## Files

- `dummy-readings-2026-06-01-to-2026-07-08.json`: Dummy readings from June 1, 2026 to July 8, 2026. Contains 212 records.
- `dummy-readings-2026-07-09-to-2028-07-09.json`: Dummy readings from July 9, 2026 to July 9, 2028. Contains 4046 records.
- `import-dummy-to-current-account-console.js`: Browser-console importer for the currently signed-in Firebase account.

## Import Steps

1. Open `https://diabetes-log-pwa.web.app`.
2. Sign in with an allowed Google account.
3. Open the browser DevTools Console.
4. If pasting is blocked, type `allow pasting` and press Enter.
5. Paste and run the full contents of `import-dummy-to-current-account-console.js`.
6. Select the dummy JSON file you want to import.
7. Confirm the prompt. The data will be written to Firestore and the page will reload.

## Notes

- Only accounts listed in `allowedEmails` inside the script can import data.
- All dummy document IDs start with `dummy-`.
- Re-importing the same JSON file overwrites documents with the same `dummy-` IDs.
- Real records use different IDs, but real and dummy records can appear together in the app.
- Large files create Firestore write operations, so use them only for testing.